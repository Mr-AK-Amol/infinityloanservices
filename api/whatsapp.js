const WHATSAPP_RECIPIENT = "917045408368";
const MAX_DETAILS_CHARACTERS = 25000;
const MAX_TEMPLATE_PARAMETER_CHARACTERS = 900;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method not allowed." });
  }

  const config = {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    templateName: process.env.WHATSAPP_TEMPLATE_NAME,
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE,
    graphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION
  };
  const missingConfig = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => ({
      accessToken: "WHATSAPP_ACCESS_TOKEN",
      phoneNumberId: "WHATSAPP_PHONE_NUMBER_ID",
      templateName: "WHATSAPP_TEMPLATE_NAME",
      templateLanguage: "WHATSAPP_TEMPLATE_LANGUAGE",
      graphApiVersion: "WHATSAPP_GRAPH_API_VERSION"
    })[key]);
  if (missingConfig.length) {
    return res.status(503).json({
      success: false,
      message: `WhatsApp is not configured. Set these server environment variables: ${missingConfig.join(", ")}.`
    });
  }
  if (!/^v\d+\.\d+$/.test(config.graphApiVersion)) {
    return res.status(500).json({
      success: false,
      message: "WHATSAPP_GRAPH_API_VERSION must use the Meta Graph API version format, for example vXX.0."
    });
  }

  try {
    let payload = req.body;
    if (typeof payload === "string") payload = JSON.parse(payload);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({ success: false, message: "Invalid WhatsApp inquiry payload." });
    }

    const entries = Object.entries(payload)
      .filter(([key]) => !key.startsWith("_") && key !== "inquiryMessage")
      .map(([key, value]) => {
        const label = key
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .replace(/[_-]+/g, " ")
          .replace(/^[a-z]/, character => character.toUpperCase());
        const text = Array.isArray(value) ? value.join(", ")
          : value === null || value === undefined ? "" : String(value);
        return text.trim() ? `${label}: ${text.trim()}` : "";
      })
      .filter(Boolean);

    if (!entries.length) {
      return res.status(400).json({ success: false, message: "No inquiry details were received." });
    }

    const details = `Infinity Loan Services — New Inquiry\n\n${entries.join("\n")}`;
    if (Array.from(details).length > MAX_DETAILS_CHARACTERS) {
      return res.status(413).json({
        success: false,
        message: `The inquiry is too long for WhatsApp delivery (maximum ${MAX_DETAILS_CHARACTERS} characters).`
      });
    }

    const chunks = splitIntoChunks(details, MAX_TEMPLATE_PARAMETER_CHARACTERS);
    let acceptedMessages = 0;
    for (let index = 0; index < chunks.length; index += 1) {
      const part = `Part ${index + 1}/${chunks.length}\n${chunks[index]}`;
      const upstream = await fetch(
        `https://graph.facebook.com/${config.graphApiVersion}/${encodeURIComponent(config.phoneNumberId)}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: WHATSAPP_RECIPIENT,
            type: "template",
            template: {
              name: config.templateName,
              language: { code: config.templateLanguage },
              components: [{
                type: "body",
                parameters: [{ type: "text", text: part }]
              }]
            }
          })
        }
      );

      const raw = await upstream.text();
      let result = {};
      try { result = raw ? JSON.parse(raw) : {}; } catch { result = {}; }
      if (!upstream.ok || !Array.isArray(result.messages) || !result.messages[0]?.id) {
        console.error("WhatsApp API rejected an inquiry message:", upstream.status, result.error?.code || "unknown");
        return res.status(502).json({
          success: false,
          acceptedMessages,
          totalMessages: chunks.length,
          message: `WhatsApp did not accept all inquiry details (${acceptedMessages} of ${chunks.length} message parts accepted). Check the WhatsApp token, approved template, recipient eligibility, and Meta API setup.`
        });
      }
      acceptedMessages += 1;
    }

    return res.status(200).json({
      success: true,
      message: `WhatsApp accepted all ${acceptedMessages} inquiry message part(s) for delivery.`
    });
  } catch (error) {
    console.error("WhatsApp submission failed:", error.message);
    return res.status(502).json({
      success: false,
      message: "WhatsApp could not accept the inquiry. Please check the WhatsApp API configuration and retry."
    });
  }
};

function splitIntoChunks(text, maxCharacters) {
  const chunks = [];
  let chunk = "";
  for (const character of text) {
    if (chunk.length + character.length > maxCharacters) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
