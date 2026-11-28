// Vercel serverless proxy for FormSubmit.
// Keeps the FormSubmit request server-to-server so browsers do not block it with CORS.
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method not allowed." });
  }

  try {
    let payload = req.body;
    if (typeof payload === "string") payload = JSON.parse(payload);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({ success: false, message: "Invalid email payload." });
    }

    // Recipient is fixed server-side; clients cannot redirect submissions elsewhere.
<<<<<<< HEAD
    // Append a unique identifier to help each inquiry arrive as a separate email.
    const rawSubject = String(payload._subject || "Website Inquiry")
      .replace(/[\\r\\n]+/g, " ").slice(0, 140);
    const inquiryId = `${Date.now()}-${require("crypto").randomUUID().slice(0, 8).toUpperCase()}`;
    payload._subject = `${rawSubject} | Inquiry ID ${inquiryId}`;
=======
>>>>>>> ae5e76e25ada80995aee1653e963f0825d591510
    payload._captcha = "false";
    payload._template = "table";

    const upstream = await fetch("https://formsubmit.co/ajax/official.infinityloanservices@gmail.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const raw = await upstream.text();
    let result;
    try { result = JSON.parse(raw); }
    catch { result = { message: raw || "FormSubmit returned an unreadable response." }; }

    const accepted = upstream.ok && result && (result.success === true || result.success === "true");
    if (!accepted) {
      return res.status(502).json({
        success: false,
        message: result.message || `FormSubmit returned HTTP ${upstream.status}.`
      });
    }

    return res.status(200).json({ success: true, message: "SubmitForm.co accepted the email request." });
  } catch (error) {
    console.error("FormSubmit proxy error:", error);
    return res.status(502).json({ success: false, message: "Could not reach FormSubmit. Please try again." });
  }
};
