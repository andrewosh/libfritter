const test = require('ava')
const DatArchive = require('node-dat-archive')
const tempy = require('tempy')
const LibFritter = require('../')
const fs = require('fs')

var fritter

var alice
var bob
var carla

test.before('archive creation', async t => {
  // create the archives
  ;[alice, bob, carla] = await Promise.all([
    DatArchive.create({title: 'Alice', localPath: tempy.directory()}),
    DatArchive.create({title: 'Bob', localPath: tempy.directory()}),
    DatArchive.create({title: 'Carla', localPath: tempy.directory()})
  ])

  // setup libfritter
  fritter = new LibFritter({mainIndex: tempy.directory(), DatArchive})
  fritter.setUser(alice)
  await fritter.db.open()
  await fritter.prepareArchive(alice)
  await fritter.prepareArchive(bob)
  await fritter.prepareArchive(carla)
  await fritter.db.indexArchive([alice, bob, carla])
})

test.after('close db', async t => {
  await fritter.db.close()
})

test('profile data', async t => {
  // write profiles
  await fritter.social.setProfile(alice, {
    name: 'Alice',
    bio: 'A cool hacker girl',
    avatar: 'alice.png',
    follows: [{name: 'Bob', url: bob.url}, {name: 'Carla', url: carla.url}]
  })
  await fritter.social.setProfile(bob, {
    name: 'Bob',
    avatar: 'bob.png',
    bio: 'A cool hacker guy'
  })
  const avatarBuffer = fs.readFileSync('avatar.jpg').buffer
  await fritter.social.setAvatar(bob, avatarBuffer, 'jpg')
  await fritter.social.follow(bob, alice, 'Alice')
  await fritter.social.setProfile(carla, {
    name: 'Carla'
  })
  await fritter.social.follow(carla, alice)

  // verify data
  t.truthy(await bob.stat('/avatar.jpg'))
  t.deepEqual(profileSubset(await fritter.social.getProfile(alice)), {
    name: 'Alice',
    bio: 'A cool hacker girl',
    avatar: 'alice.png',
    followUrls: [bob.url, carla.url],
    follows: [{name: 'Bob', url: bob.url}, {name: 'Carla', url: carla.url}]
  })
  t.deepEqual(profileSubset(await fritter.social.getProfile(bob)), {
    name: 'Bob',
    bio: 'A cool hacker guy',
    avatar: 'avatar.jpg',
    followUrls: [alice.url],
    follows: [{name: 'Alice', url: alice.url}]
  })
  t.deepEqual(profileSubset(await fritter.social.getProfile(carla)), {
    name: 'Carla',
    bio: undefined,
    avatar: undefined,
    followUrls: [alice.url],
    follows: [{url: alice.url}]
  })
})

test('votes', async t => {
  // vote
  await fritter.feed.vote(alice, {subject: 'https://beakerbrowser.com', vote: 1})
  await fritter.feed.vote(bob, {subject: 'https://beakerbrowser.com', vote: 1})
  await fritter.feed.vote(carla, {subject: 'https://beakerbrowser.com', vote: 1})
  await fritter.feed.vote(alice, {subject: 'dat://beakerbrowser.com', vote: 1})
  await fritter.feed.vote(bob, {subject: 'dat://beakerbrowser.com', vote: 0})
  await fritter.feed.vote(carla, {subject: 'dat://beakerbrowser.com', vote: -1})
  await fritter.feed.vote(alice, {subject: 'dat://bob.com/posts/1.json', vote: -1})
  await fritter.feed.vote(bob, {subject: 'dat://bob.com/posts/1.json', vote: -1})
  await fritter.feed.vote(carla, {subject: 'dat://bob.com/posts/1.json', vote: -1})

  // listVotesFor

  // simple usage
  t.deepEqual(voteSubsets(await fritter.feed.listVotesFor('https://beakerbrowser.com')), [
    { subject: 'https://beakerbrowser.com',
      vote: 1,
      author: false },
    { subject: 'https://beakerbrowser.com',
      vote: 1,
      author: false },
    { subject: 'https://beakerbrowser.com',
      vote: 1,
      author: false }
  ])
  // url is normalized
  t.deepEqual(voteSubsets(await fritter.feed.listVotesFor('https://beakerbrowser.com/')), [
    { subject: 'https://beakerbrowser.com',
      vote: 1,
      author: false },
    { subject: 'https://beakerbrowser.com',
      vote: 1,
      author: false },
    { subject: 'https://beakerbrowser.com',
      vote: 1,
      author: false }
  ])
  // simple usage
  t.deepEqual(voteSubsets(await fritter.feed.listVotesFor('dat://beakerbrowser.com')), [
    { subject: 'dat://beakerbrowser.com',
      vote: 1,
      author: false },
    { subject: 'dat://beakerbrowser.com',
      vote: 0,
      author: false },
    { subject: 'dat://beakerbrowser.com',
      vote: -1,
      author: false }
  ])
  // simple usage
  t.deepEqual(voteSubsets(await fritter.feed.listVotesFor('dat://bob.com/posts/1.json')), [
    { subject: 'dat://bob.com/posts/1.json',
      vote: -1,
      author: false },
    { subject: 'dat://bob.com/posts/1.json',
      vote: -1,
      author: false },
    { subject: 'dat://bob.com/posts/1.json',
      vote: -1,
      author: false }
  ])

  // countVotesFor

  // simple usage
  t.deepEqual(await fritter.feed.countVotesFor('https://beakerbrowser.com'), {
    up: 3,
    down: 0,
    value: 3,
    upVoters: [alice.url, bob.url, carla.url]
  })
  // url is normalized
  t.deepEqual(await fritter.feed.countVotesFor('https://beakerbrowser.com/'), {
    up: 3,
    down: 0,
    value: 3,
    upVoters: [alice.url, bob.url, carla.url]
  })
  // simple usage
  t.deepEqual(await fritter.feed.countVotesFor('dat://beakerbrowser.com'), {
    up: 1,
    down: 1,
    value: 0,
    upVoters: [alice.url]
  })
  // simple usage
  t.deepEqual(await fritter.feed.countVotesFor('dat://bob.com/posts/1.json'), {
    up: 0,
    down: 3,
    value: -3,
    upVoters: []
  })
})

test('posts', async t => {
  // make some posts
  var post1Url = await fritter.feed.post(alice, {text: 'First'})
  await fritter.feed.post(bob, {text: 'Second'})
  await fritter.feed.post(carla, {text: 'Third'})
  await fritter.feed.post(bob, {text: '@Alice', mentions: [{ name: 'Alice', url: alice.url }]})
  var reply1Url = await fritter.feed.post(bob, {
    text: 'First reply',
    threadParent: post1Url,
    threadRoot: post1Url
  })
  await fritter.feed.post(carla, {
    text: 'Second reply',
    threadParent: reply1Url,
    threadRoot: post1Url
  })
  await fritter.feed.post(alice, {text: 'Fourth'})

  // add some votes
  await fritter.feed.vote(bob, {vote: 1, subject: post1Url, subjectType: 'post'})
  await fritter.feed.vote(carla, {vote: 1, subject: post1Url, subjectType: 'post'})

  // get a thread
  t.deepEqual(postSubset(await fritter.feed.getThread(post1Url)), {
    author: true,
    text: 'First',
    threadParent: undefined,
    threadRoot: undefined,
    votes: {up: 2, down: 0, value: 2, upVoters: [bob.url, carla.url]},
    replies: [
      {
        author: true,
        text: 'First reply',
        threadParent: post1Url,
        threadRoot: post1Url,
        votes: {up: 0, down: 0, value: 0, upVoters: []},
        replies: [
          {
            author: true,
            text: 'Second reply',
            threadParent: reply1Url,
            threadRoot: post1Url,
            votes: {up: 0, down: 0, value: 0, upVoters: []},
            replies: undefined
          }
        ]
      }
    ]
  })

  // get a thread at the middle
  let threadInTheMiddle = await fritter.feed.getThread(reply1Url)
  t.deepEqual(postSubset(threadInTheMiddle), {
    author: true,
    text: 'First reply',
    threadParent: post1Url,
    threadRoot: post1Url,
    votes: {up: 0, down: 0, value: 0, upVoters: []},
    replies: [
      {
        author: true,
        text: 'Second reply',
        threadParent: reply1Url,
        threadRoot: post1Url,
        votes: {up: 0, down: 0, value: 0, upVoters: []},
        replies: undefined
      }
    ]
  })
  t.deepEqual(postSubset(threadInTheMiddle.parent), {
    author: true,
    text: 'First',
    threadParent: undefined,
    threadRoot: undefined,
    votes: {up: 2, down: 0, value: 2, upVoters: [bob.url, carla.url]},
    replies: [
      {
        author: true,
        text: 'First reply',
        threadParent: post1Url,
        threadRoot: post1Url,
        votes: {up: 0, down: 0, value: 0, upVoters: []},
        replies: [
          {
            author: true,
            text: 'Second reply',
            threadParent: reply1Url,
            threadRoot: post1Url,
            votes: {up: 0, down: 0, value: 0, upVoters: []},
            replies: undefined
          }
        ]
      }
    ]
  })

  // list posts
  t.deepEqual(postSubsets(await fritter.feed.listPosts()), [
    { author: false,
      text: 'First',
      threadParent: undefined,
      threadRoot: undefined,
      votes: undefined,
      replies: undefined },
    { author: false,
      text: 'Second',
      threadParent: undefined,
      threadRoot: undefined,
      votes: undefined,
      replies: undefined },
    { author: false,
      text: 'Third',
      threadParent: undefined,
      threadRoot: undefined,
      votes: undefined,
      replies: undefined },
    { author: false,
      text: '@Alice',
      threadParent: undefined,
      threadRoot: undefined,
      votes: undefined,
      replies: undefined },
    { author: false,
      text: 'First reply',
      threadParent: post1Url,
      threadRoot: post1Url,
      votes: undefined,
      replies: undefined },
    { author: false,
      text: 'Second reply',
      threadParent: reply1Url,
      threadRoot: post1Url,
      votes: undefined,
      replies: undefined },
    { author: false,
      text: 'Fourth',
      threadParent: undefined,
      threadRoot: undefined,
      votes: undefined,
      replies: undefined }
  ])

  // list posts (no replies)
  t.deepEqual(postSubsets(await fritter.feed.listPosts({rootPostsOnly: true})), [
    {
      author: false,
      text: 'First',
      threadParent: undefined,
      threadRoot: undefined,
      votes: undefined,
      replies: undefined
    },
    {
      author: false,
      text: 'Second',
      threadParent: undefined,
      threadRoot: undefined,
      votes: undefined,
      replies: undefined
    },
    {
      author: false,
      text: 'Third',
      threadParent: undefined,
      threadRoot: undefined,
      votes: undefined,
      replies: undefined
    },
    {
      author: false,
      text: '@Alice',
      threadParent: undefined,
      threadRoot: undefined,
      votes: undefined,
      replies: undefined
    },
    {
      author: false,
      text: 'Fourth',
      threadParent: undefined,
      threadRoot: undefined,
      votes: undefined,
      replies: undefined
    }
  ])

  // list posts (authors, votes, and replies)
  t.deepEqual(postSubsets(await fritter.feed.listPosts({fetchAuthor: true, rootPostsOnly: true, countVotes: true, countReplies: true})), [
    {
      author: true,
      text: 'First',
      threadParent: undefined,
      threadRoot: undefined,
      votes: {up: 2, down: 0, value: 2, upVoters: [bob.url, carla.url]},
      replies: 2
    },
    {
      author: true,
      text: 'Second',
      threadParent: undefined,
      threadRoot: undefined,
      votes: {up: 0, down: 0, value: 0, upVoters: []},
      replies: 0
    },
    {
      author: true,
      text: 'Third',
      threadParent: undefined,
      threadRoot: undefined,
      votes: {up: 0, down: 0, value: 0, upVoters: []},
      replies: 0
    },
    {
      author: true,
      text: '@Alice',
      threadParent: undefined,
      threadRoot: undefined,
      votes: {up: 0, down: 0, value: 0, upVoters: []},
      replies: 0
    },
    {
      author: true,
      text: 'Fourth',
      threadParent: undefined,
      threadRoot: undefined,
      votes: {up: 0, down: 0, value: 0, upVoters: []},
      replies: 0
    }
  ])

  // list posts (limit, offset, reverse)
  t.deepEqual(postSubsets(await fritter.feed.listPosts({rootPostsOnly: true, limit: 1, offset: 1, fetchAuthor: true, countVotes: true, countReplies: true})), [
    {
      author: true,
      text: 'Second',
      threadParent: undefined,
      threadRoot: undefined,
      votes: {up: 0, down: 0, value: 0, upVoters: []},
      replies: 0
    }
  ])
  t.deepEqual(postSubsets(await fritter.feed.listPosts({rootPostsOnly: true, reverse: true, limit: 1, offset: 1, fetchAuthor: true, countVotes: true, countReplies: true})), [
    {
      author: true,
      text: '@Alice',
      threadParent: undefined,
      threadRoot: undefined,
      votes: {up: 0, down: 0, value: 0, upVoters: []},
      replies: 0
    }
  ])
})

test('notifications', async (t) => {
  var notifications = await fritter.notifications.listNotifications({fetchPost: true, fetchAuthor: true})

  t.is(notifications.length, 5)
  t.is(notifications[0].type, 'mention')
  t.is(notifications[0].post.mentions[0].url, alice.url)
  t.is(notifications[0].author.getRecordOrigin(), bob.url)
  t.is(notifications[1].type, 'reply')
  t.truthy(notifications[1].url.startsWith(bob.url))
  t.is(notifications[1].author.getRecordOrigin(), bob.url)
  t.is(notifications[1].post.author.getRecordOrigin(), bob.url)
  t.is(notifications[1].post.text, 'First reply')
  t.is(notifications[2].type, 'reply')
  t.truthy(notifications[2].url.startsWith(carla.url))
  t.is(notifications[2].author.getRecordOrigin(), carla.url)
  t.is(notifications[2].post.author.getRecordOrigin(), carla.url)
  t.is(notifications[2].post.text, 'Second reply')
  t.is(notifications[3].type, 'vote')
  t.is(notifications[3].origin, bob.url)
  t.truthy(notifications[3].subject.startsWith(alice.url))
  t.is(notifications[3].author.getRecordOrigin(), bob.url)
  t.is(notifications[4].type, 'vote')
  t.is(notifications[4].origin, carla.url)
  t.truthy(notifications[4].subject.startsWith(alice.url))
  t.is(notifications[4].author.getRecordOrigin(), carla.url)

  var notifications = await fritter.notifications.listNotifications({offset: 1, limit: 2, reverse: true})

  t.is(notifications.length, 2)
  t.is(notifications[1].type, 'reply')
  t.truthy(notifications[1].url.startsWith(carla.url))
  t.is(notifications[0].type, 'vote')
  t.is(notifications[0].origin, bob.url)
  t.truthy(notifications[0].subject.startsWith(alice.url))
})

function profileSubset (p) {
  return {
    name: p.name,
    bio: p.bio,
    avatar: p.avatar,
    followUrls: p.followUrls,
    follows: p.follows
  }
}

function voteSubsets (vs) {
  vs = vs.map(voteSubset)
  vs.sort((a, b) => b.vote - a.vote)
  return vs
}

function voteSubset (v) {
  return {
    subject: v.subject,
    vote: v.vote,
    author: !!v.author
  }
}

function postSubsets (ps) {
  ps = ps.map(postSubset)
  return ps
}

function postSubset (p) {
  return {
    author: !!p.author,
    text: p.text,
    threadParent: p.threadParent,
    threadRoot: p.threadRoot,
    votes: p.votes,
    replies: Array.isArray(p.replies) ? postSubsets(p.replies) : p.replies
  }
}
