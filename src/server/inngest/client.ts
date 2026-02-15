import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "reqvolt",
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
