chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    callback({
      authCredentials: {
        username: "tlqpxdpl",
        password: "f2wwmd27mzu1"
      }
    });
  },
  { urls: ["<all_urls>"] },
  ["asyncBlocking"]
);
