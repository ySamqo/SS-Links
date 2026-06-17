const serverless = require("serverless-http");
const app = require("../../server");

const handler = serverless(app);
const functionPath = "/.netlify/functions/app";

function stripFunctionPath(value) {
  if (!value || !value.startsWith(functionPath)) return value;
  return value.slice(functionPath.length) || "/";
}

module.exports.handler = (event, context) => {
  event.path = stripFunctionPath(event.path);
  event.rawPath = stripFunctionPath(event.rawPath);
  event.headers = event.headers || {};

  if (event.rawUrl) {
    event.rawUrl = event.rawUrl.replace(functionPath, "");
  }

  if (event.requestContext && event.requestContext.http) {
    event.requestContext.http.path = stripFunctionPath(event.requestContext.http.path);
  }

  if (event.httpMethod === "POST" && event.body) {
    event.headers["x-ss-netlify-body"] = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
  }

  return handler(event, context);
};
