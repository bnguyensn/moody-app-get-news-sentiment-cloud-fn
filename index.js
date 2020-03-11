const admin = require('firebase-admin');
const functions = require('firebase-functions');

let db;

/**
 * Application initialization follows this documentation:
 * https://firebase.google.com/docs/firestore/quickstart#initialize
 */
const initialize = () => {
  try {
    if (process.env.IS_OWN_SERVER === 'true') {
      // We're running the app in our own Node.js environment. This is mainly
      // used when we're testing the application out.

      try {
        admin.app();
      } catch (err) {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
        });

        db = admin.firestore();
      }
    } else {
      // We assume that the app is being run as a GCP cloud function.

      try {
        admin.app();
      } catch (err) {
        admin.initializeApp(functions.config().firebase);
        db = admin.firestore();
      }
    }
  } catch (err) {
    throw err;
  }
};

const getNewsSentiment = async topic => {
  const query = db
    .collection(process.env.SENTIMENT_COLLECTION_NAME)
    .where('topic', '==', topic);
  const querySnapshot = await query.get();

  if (querySnapshot.empty) {
    return [];
  }

  return querySnapshot.docs;
};

const getAverageSentiment = sentimentDocumentSnapshots => {
  let alvinTotal = {};
  let facebookTotal = {};

  let alvinCount = {};
  let facebookCount = {};

  let alvinAverage = {};
  let facebookAverage = {};

  for (const sentimentDocumentSnapshot of sentimentDocumentSnapshots) {
    const sentimentData = sentimentDocumentSnapshot.data();
    const {
      date,
      sentiment: { alvin, facebook },
    } = sentimentData;

    if (alvin) {
      if (!alvinTotal[date]) {
        alvinTotal[date] = 0;
        alvinCount[date] = 0;
      }

      alvinTotal[date] += alvin;
      alvinCount[date] += 1;
    }

    if (facebook) {
      if (!facebookTotal[date]) {
        facebookTotal[date] = {
          positive: 0,
          neutral: 0,
          negative: 0,
        };
        facebookCount[date] = 0;
      }

      facebookTotal[date].positive += facebook.positive;
      facebookTotal[date].neutral += facebook.neutral;
      facebookTotal[date].negative += facebook.negative;
      facebookCount[date] += 1;
    }
  }

  Object.entries(alvinTotal).forEach(([date, alvin]) => {
    alvinAverage[date] = alvin / alvinCount[date];
  });

  Object.entries(facebookTotal).forEach(([date, facebook]) => {
    facebookAverage[date] = {
      positive: facebook.positive / facebookCount[date],
      neutral: facebook.neutral / facebookCount[date],
      negative: facebook.negative / facebookCount[date],
    };
  });

  return {
    alvinAverage,
    facebookAverage,
  };
};

/**
 * Responds to an HTTP request using data from the request body parsed according
 * to the "content-type" header.
 *
 * @param {Object} req - Cloud Function request context.
 * @param {Object} res - Cloud Function response context.
 */
exports.moody = async (req, res) => {
  try {
    initialize();

    const topic = req.query.topic;

    console.log(`Getting news sentiment data for topic ${topic}`);
    const newsDocumentSnapshots = await getNewsSentiment(topic);

    if (newsDocumentSnapshots.length === 0) {
      res.set('Access-Control-Allow-Origin', '*');
      return res
        .status(404)
        .send(`No news sentiment data found for topic ${topic}`);
    }

    console.log(`Getting average news sentiment data for topic ${topic}`);
    const averageSentiment = getAverageSentiment(newsDocumentSnapshots);

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', 'application/json');
    return res.status(200).send({
      data: averageSentiment,
    });
  } catch (err) {
    console.error(err);
    console.error(new Error(err.stack));

    res.set('Access-Control-Allow-Origin', '*');
    return res.status(500).send(err.message);
  }
};
