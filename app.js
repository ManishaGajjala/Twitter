const express = require("express");
const app = express();
app.use(express.json());

const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const path = require("path");
const db_path = path.join(__dirname, "twitterClone.db");

let db = null;

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const initializeDbAndServer = async () => {
  db = await open({ filename: db_path, driver: sqlite3.Database });
  app.listen(3000, () => {
    try {
      console.log("server running at http://localhost:3000");
    } catch (error) {
      console.log(`DB ERROR ${error.message}`);
      process.exit(1);
    }
  });
};
initializeDbAndServer();

const authenticateToken = (request, response, next) => {
  let authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    authHeader = authHeader.split(" ");
    const jwtToken = authHeader[1];
    jwt.verify(jwtToken, "MYSECRET", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

// API 1 POST
app.post("/register/", async (request, response) => {
  try {
    const { username, password, name, gender } = request.body;
    const checkUser = `
        SELECT
        *
        FROM
        user
        WHERE
        username='${username}';`;
    const dbResponse = await db.all(checkUser);
    if (dbResponse.length > 0) {
      response.status(400);
      response.send("User already exists");
    } else {
      if (password.length < 6) {
        response.status(400);
        response.send("Password is too short");
      } else {
        const hashedPassword = await bcrypt.hash(password, 10);
        const Query = `
                INSERT INTO
                user ( name,username,password,gender)
                VALUES
                (
                        "${name}",
                        "${username}",
                        "${hashedPassword}",
                        "${gender}"
                        );`;
        await db.run(Query);
        response.send("User created successfully");
      }
    }
  } catch (error) {
    console.log(`ERROR API ${error.message}`);
  }
});
//API 2 POST
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MYSECRET");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API 3 GET
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  try {
    const { username } = request;
    //console.log(username["username"]);
    let getUserIdQuery = `
    SELECT 
        *
    FROM 
        user
    WHERE
        username='${username}';`;
    const userIdObject = await db.get(getUserIdQuery);
    console.log(userIdObject);
    const userId = userIdObject["user_id"];

    const getFollowingQuery = `
    SELECT 
        user.username as username,tweet,date_time as dateTime
    FROM
       (follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id) NATURAL JOIN user
    WHERE
        follower.follower_user_id=${userId}
    ORDER BY 
        date_time DESC
    LIMIT 4;`;
    const results = await db.all(getFollowingQuery);
    response.send(results);
  } catch (error) {
    console.log(`ERROR API ${error.message}`);
  }
});

// API 4 GET
app.get("/user/following/", authenticateToken, async (request, response) => {
  try {
    const username = request.username;
    //console.log(username["username"]);

    const getUserIdQuery = `
    SELECT 
        user_id
    FROM 
        user
    WHERE
        username='${username}';`;
    const userIdObject = await db.get(getUserIdQuery);
    const userId = userIdObject["user_id"];
    const getFollowingQuery = `
    SELECT 
        name
    FROM
        follower INNER JOIN user ON follower.following_user_id=user.user_id
    WHERE
        follower.follower_user_id=${userId};`;
    const results = await db.all(getFollowingQuery);
    response.send(results);
  } catch (error) {
    console.log(`ERROR API ${error.message}`);
  }
});

// API 5 GET
app.get("/user/followers/", authenticateToken, async (request, response) => {
  try {
    const username = request.username;
    const getUserIdQuery = `
    SELECT 
        user_id
    FROM 
        user
    WHERE
        username='${username}';`;
    const userIdObject = await db.get(getUserIdQuery);
    const userId = userIdObject["user_id"];
    const getFollowingQuery = `
    SELECT 
        name
    FROM
        follower INNER JOIN user ON follower.follower_user_id=user.user_id
    WHERE
        follower.following_user_id=${userId};`;
    const results = await db.all(getFollowingQuery);
    response.send(results);
  } catch (error) {
    console.log(`ERROR API ${error.message}`);
  }
});

// API 6 GET
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.username;
  const getUserIdQuery = `
        SELECT 
        user_id
        FROM 
        user
        WHERE
        username='${username}';`;
  const userIdObject = await db.get(getUserIdQuery);
  const userId = userIdObject["user_id"];
  const getFollowingQuery = `
        SELECT
        DISTINCT(tweet_id)
        FROM
        follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id
        WHERE
        follower.follower_user_id=${userId} and
        tweet.tweet_id=${tweetId};`;

  const results = await db.get(getFollowingQuery);
  console.log(results);
  if (results === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const tweetInfoQuery = `
            SELECT tweet,COUNT(DISTINCT like_id)AS likes,COUNT(DISTINCT reply_id)AS replies,tweet.date_time AS dateTime
            FROM (tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id) AS t INNER JOIN reply ON
            t.tweet_id=reply.tweet_id
            WHERE tweet.tweet_id=${tweetId};`;
    const info = await db.get(tweetInfoQuery);
    response.send(info);
  }
});

//API7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserDetails = `
    SELECT 
        user_id FROM user
        WHERE username='${username}';`;
    const userDetails = await db.get(getUserDetails);
    const userId = userDetails["user_id"];
    const getFollowingQuery = `
        SELECT DISTINCT(tweet_id) FROM
        follower INNER JOIN tweet ON 
        follower.following_user_id=tweet.user_id
        WHERE follower.follower_user_id=${userId} and
        tweet.tweet_id=${tweetId};`;
    const results = await db.get(getFollowingQuery);
    if (results === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getLikeQuery = `
            SELECT username FROM
            user NATURAL JOIN like
            WHERE like.tweet_id=${tweetId};`;
      const users = await db.all(getLikeQuery);
      let usersList = [];
      for (let i = 0; i < users.length; i++) {
        usersList.push(users[i].username);
      }
      console.log(usersList);
      response.send({ likes: usersList });
    }
  }
);

//API8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserDetails = `
    SELECT 
        user_id FROM user
        WHERE username='${username}';`;
    const userDetails = await db.get(getUserDetails);
    const userId = userDetails["user_id"];
    const getFollowingQuery = `
        SELECT DISTINCT(tweet_id) FROM
        follower INNER JOIN tweet ON 
        follower.following_user_id=tweet.user_id
        WHERE follower.follower_user_id=${userId} and
        tweet.tweet_id=${tweetId};`;
    const results = await db.get(getFollowingQuery);
    if (results === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getRepliesQuery = `
            SELECT name,reply FROM
            user NATURAL JOIN reply
            WHERE tweet_id=${tweetId};
       `;
      const dbResponse = await db.all(getRepliesQuery);
      response.send({ replies: dbResponse });
    }
  }
);

//API9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `
    SELECT 
        user_id
    FROM 
        user
    WHERE
        username='${username}';`;
  const userIdObject = await db.get(getUserIdQuery);
  const userId = userIdObject["user_id"];
  const userTweetsQuery = `
        SELECT tweet,
            (SELECT COUNT(like_id) FROM like WHERE tweet_id=tweet.tweet_id)AS likes,
            (SELECT COUNT(DISTINCT reply_id) FROM reply WHERE reply.tweet_id=tweet.tweet_id)AS replies,
            tweet.date_time AS dateTime FROM tweet
            WHERE user_id=${userId};
    `;
  const dbResult = await db.all(userTweetsQuery);
  response.send(dbResult);
});

//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const tweetDetails = request.body;
  const { tweet } = tweetDetails;
  const postTweetQuery = `
        INSERT INTO tweet (tweet)
        VALUES ('${tweet}');
    `;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetails = `
    SELECT 
        user_id FROM user
        WHERE username='${username}';`;
    const userDetails = await db.get(getUserDetails);
    const userId = userDetails["user_id"];
    console.log(userId);
    const getUserIDforTweet = `
        SELECT user_id FROM tweet WHERE tweet_id=${tweetId};
    `;
    const UserDetailsForTweet = await db.get(getUserIDforTweet);
    console.log(UserDetailsForTweet);
    const tweetUserId = UserDetailsForTweet["user_id"];
    console.log(tweetUserId);
    if (tweetUserId === userId) {
      const deleteTweet = `
            DELETE FROM tweet
            WHERE tweet_id=${tweetId}
        `;
      await db.run(deleteTweet);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
