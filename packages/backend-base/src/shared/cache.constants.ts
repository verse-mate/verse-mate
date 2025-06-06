function resetPassword(key: string): string {
  return `resetPassword:${key}`;
}

function accessToken(key: string): string {
  return `accessToken:${key}`;
}

function verifyEmail(key: string): string {
  return `verifyEmail:${key}`;
}

const cacheConstants = {
  resetPassword,
  accessToken,
  verifyEmail,
};

export default cacheConstants;
