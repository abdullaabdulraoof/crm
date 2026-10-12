const mongoServer = require("./mongoServer");

module.exports = async () => {
  const server = await mongoServer.start();
  process.env.TEST_MONGODB_URI = server.getUri();
  console.log(`[tests] in-memory MongoDB started: ${process.env.TEST_MONGODB_URI}`);
};
