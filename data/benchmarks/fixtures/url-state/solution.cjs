module.exports = {
  encode(state) { return new URLSearchParams(state).toString(); },
  decode(query) { return Object.fromEntries(new URLSearchParams(query)); }
};
