module.exports = function requireEnvVar(name) {
  var value = process.env[name];

  if (value != null) {
    return value;
  } else {
    throw new Error(`!      Environment variable "${name}" is required`);
  }
}
