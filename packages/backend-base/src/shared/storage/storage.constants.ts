import timeConstants from "../time.constants";

const mainFolder = "project";

const profileFolder = "profile";

function privateObjectStorageUrlExpiresInSeconds() {
  return timeConstants.oneDay() * 3;
}

function publicObjectStorageUrlExpiresInSeconds() {
  return timeConstants.oneHour() * 3;
}

const storageConstants = {
  mainFolder,
  privateObjectStorageUrlExpiresInSeconds,
  profileFolder,
  publicObjectStorageUrlExpiresInSeconds,
};

export default storageConstants;
