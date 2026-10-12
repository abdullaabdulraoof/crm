const mongoose = require("mongoose");

const connectDB = async (uri = process.env.MONGODB_URI) => {
  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  const conn = await mongoose.connect(uri);
  console.log(`MongoDB Connected: ${conn.connection.host}`);
  return conn;
};

module.exports = connectDB;
