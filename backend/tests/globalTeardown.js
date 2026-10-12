const mongoServer = require("./mongoServer");

module.exports = async () => {
  await mongoServer.stop();
  console.log("[tests] in-memory MongoDB stopped");
};
