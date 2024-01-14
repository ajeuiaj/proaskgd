/** This whole module kinda sucks */
import fs from "fs";
import { Request, Response } from "express";
import showdown from "showdown";
import { config } from "./config";
import { buildInfo, ServiceInfo } from "./service-info";
import { getLastNImages } from "./shared/file-storage/image-history";
import { keyPool } from "./shared/key-management";
import { MODEL_FAMILY_SERVICE, ModelFamily } from "./shared/models";
import { currentFileNumber, islogging } from "./shared/prompt-logging/backends/files";

const INFO_PAGE_TTL = 2000;
const MODEL_FAMILY_FRIENDLY_NAME: { [f in ModelFamily]: string } = {
  "turbo": "GPT-3.5 Turbo",
  "gpt4": "GPT-4",
  "gpt4-32k": "GPT-4 32k",
  "gpt4-turbo": "GPT-4 Turbo",
  "dall-e": "DALL-E",
  "claude": "Claude",
  "gemini-pro": "Gemini Pro",
  "mistral-tiny": "Mistral 7B",
  "mistral-small": "Mixtral 8x7B",
  "mistral-medium": "Mistral Medium (prototype)",
  "aws-claude": "AWS Claude",
  "azure-turbo": "Azure GPT-3.5 Turbo",
  "azure-gpt4": "Azure GPT-4",
  "azure-gpt4-32k": "Azure GPT-4 32k",
  "azure-gpt4-turbo": "Azure GPT-4 Turbo",
};

const converter = new showdown.Converter();
const customGreeting = fs.existsSync("greeting.md")
  ? `\n## Server Greeting\n${fs.readFileSync("greeting.md", "utf8")}`
  : "";
let infoPageHtml: string | undefined;
let infoPageLastUpdated = 0;

export const handleInfoPage = (req: Request, res: Response) => {
  const htmlResponse = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="robots" content="noindex, nofollow" />
        <title>Secret</title>
        <style>
          body {
            height: 100vh;
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: #f0f0f0;
            font-family: Arial, sans-serif;
            font-size: 2em;
            color: #333;
          }
          .heart {
            color: red;
          }
        </style>
      </head>
      <body>
        <div>Secret <span class="heart">&lt;3</span></div>
      </body>
    </html>
  `;
  res.send(htmlResponse);
};


export function renderPage(info: ServiceInfo) {
  const title = getServerTitle();
  const headerHtml = buildInfoPageHeader(info);
  let loggingSection = "";

  if (config.promptLogging) {
    const loggingStatus = islogging ? "logging is enabled" : "logging is disabled";
    const fileNumberDisplay = `${currentFileNumber}/${config.promptLoggingFilecount}`;
    loggingSection = `
      <h2>Logging Status</h2>
      <p>File Number: ${fileNumberDisplay}</p>
      <p>Status: ${loggingStatus}</p>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        background-color: #f0f0f0;
        padding: 1em;
      }
      .logging-info {
        font-family: inherit;
        color: #333;
      }
    </style>
  </head>
  <body>
    ${headerHtml}
    <hr />
    ${loggingSection}
    <h2>Service Info</h2>
    <pre>${JSON.stringify(info, null, 2)}</pre>
    ${getSelfServiceLinks()}
  </body>
</html>`;
}

/**
 * If the server operator provides a `greeting.md` file, it will be included in
 * the rendered info page.
 **/
function buildInfoPageHeader(info: ServiceInfo) {
  const title = getServerTitle();
  // TODO: use some templating engine instead of this mess
  let infoBody = `# ${title}`;
  if (config.promptLogging) {
    infoBody += `\n## Prompt Logging Enabled
You can check the logging status below.
Prompt logs are anonymous and do not contain IP addresses or timestamps.
\n**If you are uncomfortable with this, don't send prompts to this proxy or wait a bit. Logging will be automatically disabled a few hours after the proxy's initial startup**`;
  }

  if (config.staticServiceInfo) {
    return converter.makeHtml(infoBody + customGreeting);
  }

  const waits: string[] = [];

  for (const modelFamily of config.allowedModelFamilies) {
    const service = MODEL_FAMILY_SERVICE[modelFamily];

    const hasKeys = keyPool.list().some((k) => {
      return k.service === service && k.modelFamilies.includes(modelFamily);
    });

    const wait = info[modelFamily]?.estimatedQueueTime;
    if (hasKeys && wait) {
      waits.push(`**${MODEL_FAMILY_FRIENDLY_NAME[modelFamily] || modelFamily}**: ${wait}`);
    }
  }

  infoBody += "\n\n" + waits.join(" / ");

  infoBody += customGreeting;

  infoBody += buildRecentImageSection();

  return converter.makeHtml(infoBody);
}

function getSelfServiceLinks() {
  if (config.gatekeeper !== "user_token") return "";
  return `<footer style="font-size: 0.8em;"><hr /><a target="_blank" href="/user/lookup">Check your user token info</a></footer>`;
}

function getServerTitle() {
  // Use manually set title if available
  if (process.env.SERVER_TITLE) {
    return process.env.SERVER_TITLE;
  }

  // Huggingface
  if (process.env.SPACE_ID) {
    return `${process.env.SPACE_AUTHOR_NAME} / ${process.env.SPACE_TITLE}`;
  }

  // Render
  if (process.env.RENDER) {
    return `Render / ${process.env.RENDER_SERVICE_NAME}`;
  }

  return "OAI Reverse Proxy";
}

function buildRecentImageSection() {
  if (
    !config.allowedModelFamilies.includes("dall-e") ||
    !config.showRecentImages
  ) {
    return "";
  }

  let html = `<h2>Recent DALL-E Generations</h2>`;
  const recentImages = getLastNImages(12).reverse();
  if (recentImages.length === 0) {
    html += `<p>No images yet.</p>`;
    return html;
  }

  html += `<div style="display: flex; flex-wrap: wrap;" id="recent-images">`;
  for (const { url, prompt } of recentImages) {
    const thumbUrl = url.replace(/\.png$/, "_t.jpg");
    const escapedPrompt = escapeHtml(prompt);
    html += `<div style="margin: 0.5em;" class="recent-image">
<a href="${url}" target="_blank"><img src="${thumbUrl}" title="${escapedPrompt}" alt="${escapedPrompt}" style="max-width: 150px; max-height: 150px;" /></a>
</div>`;
  }
  html += `</div>`;

  return html;
}

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getExternalUrlForHuggingfaceSpaceId(spaceId: string) {
  try {
    const [username, spacename] = spaceId.split("/");
    return `https://${username}-${spacename.replace(/_/g, "-")}.hf.space`;
  } catch (e) {
    return "";
  }
}
