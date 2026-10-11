import { api } from "backend-api";

export const exchangeSSOCode = async (code: string) => {
  const response = await api.auth.sso.exchange.post({ code });
  if (response.error) {
    throw response.error;
  }
  return response.data;
};
