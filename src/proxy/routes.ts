import express, { Request, Response, NextFunction } from "express";
import { gatekeeper } from "./gatekeeper";
import { checkRisuToken } from "./check-risu-token";
import { openai } from "./openai";
import { openaiImage } from "./openai-image";
import { anthropic } from "./anthropic";
import { googleAI } from "./google-ai";
import { mistralAI } from "./mistral-ai";
import { aws } from "./aws";
import { azure } from "./azure";
import { config } from "../config"

const proxyRouter = express.Router();
proxyRouter.use((req, _res, next) => {
  if (req.headers.expect) {
    // node-http-proxy does not like it when clients send `expect: 100-continue`
    // and will stall. none of the upstream APIs use this header anyway.
    delete req.headers.expect;
  }
  next();
});
proxyRouter.use(
  express.json({ limit: "1mb" }),
  express.urlencoded({ extended: true, limit: "1mb" })
);
proxyRouter.use(gatekeeper);
proxyRouter.use(checkRisuToken);
proxyRouter.use((req, _res, next) => {
  req.startTime = Date.now();
  req.retryCount = 0;
  next();
});
proxyRouter.use("/" + config.routeModifier + "openai", addV1, openai);
proxyRouter.use("/" + config.routeModifier + "openai-image", addV1, openaiImage);
proxyRouter.use("/" + config.routeModifier + "anthropic", addV1, anthropic);
proxyRouter.use("/" + config.routeModifier + "google-ai", addV1, googleAI);
proxyRouter.use("/" + config.routeModifier + "mistral-ai", addV1, mistralAI);
proxyRouter.use("/" + config.routeModifier + "aws/claude", addV1, aws);
proxyRouter.use("/" + config.routeModifier + "azure/openai", addV1, azure);


// Redirect browser requests to the homepage.
proxyRouter.get("*", (req, res, next) => {
  const isBrowser = req.headers["user-agent"]?.includes("Mozilla");
  if (isBrowser) {
    res.redirect("/");
  } else {
    next();
  }
});
export { proxyRouter as proxyRouter };

function addV1(req: Request, res: Response, next: NextFunction) {
  // Clients don't consistently use the /v1 prefix so we'll add it for them.
  if (!req.path.startsWith("/v1/")) {
    req.url = `/v1${req.url}`;
  }
  next();
}
