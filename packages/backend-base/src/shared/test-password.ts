import { faker } from "@faker-js/faker";

export const signupCompliantPassword = () =>
  `Aa1${faker.internet.password()}`.slice(0, 20);
