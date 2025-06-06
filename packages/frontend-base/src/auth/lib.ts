import { z } from "zod";

export const ACCESS_TOKEN_COOKIE = "accessToken";

export const regex = {
  email:
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
  phone: /[\D+]/g,
  locale: /[\w]+/gm,
  url: /[\w]+/gm,

  PASSWORD_REGEX: /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&]).{8,}$/,

  PASSWORD_MIN_LENGTH_REGEX: /^.{8,}$/,
  PASSWORD_AT_LEAST_ONE_SPECIAL: /[@$!%*#?&]/,
  PASSWORD_AT_LEAST_ONE_NUMBER: /[\d]/,
  PASSWORD_AT_LEAST_ONE_LETTER: /[a-zA-Z]/,
};

export const zodPassword = z
  .string()
  .min(1, "Required.")
  .regex(regex.PASSWORD_REGEX, "Password does not match the requirements.")
  .max(64, "Max length");

export const zodEmail = z
  .string()
  .min(1, "Required.")
  .max(64, "Max length")
  .email({ message: "Invalid email." })
  .toLowerCase();

export const SUPPORT_EMAIL = "support@my-domain.com";
