import HttpError from "./HttpError.js";

function twilioConfiguration() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER?.trim();
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const configured = [accountSid, authToken, phoneNumber, messagingServiceSid].some(Boolean);
  console.log("--- TWILIO ENV DEBUG ---");
  console.log("Account SID mila?", !!accountSid);
  console.log("Auth Token mila?", !!authToken);
  console.log("Phone Number mila?", !!phoneNumber);
  console.log("NODE_ENV kya hai?", process.env.NODE_ENV);
  console.log("------------------------");
  if (!configured) return null;
  if (!accountSid || !authToken || (!phoneNumber && !messagingServiceSid)) {
    throw new HttpError(
      503,
      "Twilio OTP configuration is incomplete. Set the account SID, auth token, and a phone number or messaging service SID.",
    );
  }

  return { accountSid, authToken, phoneNumber, messagingServiceSid };
}

export async function deliverOtp(phone, code) {
  const config = twilioConfiguration();
  if (!config) {
    if (process.env.NODE_ENV === "production") {
      throw new HttpError(503, "Mobile OTP delivery is not configured for this deployment.");
    }
    return "console";
  }

  const body = new URLSearchParams({
    To: `+91${phone}`,
    Body: `Your Alpha Male verification code is ${code}. It expires in 5 minutes.`,
  });
  if (config.messagingServiceSid) {
    body.set("MessagingServiceSid", config.messagingServiceSid);
  } else {
    body.set("From", config.phoneNumber);
  }

  let response;
  try {
    response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw new HttpError(502, "Twilio could not be reached. Check the server connection and try again.");
  }

  if (!response.ok) {
    let details = {};
    try {
      details = await response.json();
    } catch {
      // Twilio may return a non-JSON error response.
    }
    console.error("Twilio rejected the OTP message.", {
      status: response.status,
      code: details.code,
      message: details.message,
    });
    throw new HttpError(
      502,
      "Twilio could not send the verification code. Check the Twilio configuration and ensure the recipient is verified on a trial account.",
    );
  }

  return "sms";
}
