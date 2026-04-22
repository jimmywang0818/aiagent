'use strict';

require('dotenv').config();

const BASE_URL = 'https://open-api.omnichat.ai/v1';

const headers = {
  'Authorization': `Bearer ${process.env.OMNICHAT_API_TOKEN}`,
  'Content-Type': 'application/json',
};

/**
 * Send a text message to a room.
 * For LINE, pass replyToken (required for first reply; subsequent replies don't need it).
 */
async function sendMessage({ teamId, roomId, text, replyToken, platform }) {
  const body = {
    team: teamId,
    roomId,
    messages: [{ type: 'text', text }],
  };

  if (platform === 'line' && replyToken) {
    body.replyToken = replyToken;
  }

  const res = await fetch(`${BASE_URL}/agent-messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`[omnichat] sendMessage failed ${res.status}:`, err.errorCode, err.message);
  }
}

/**
 * Transfer room from AI Chat → Open (waiting for human agent).
 */
async function transferToHuman({ teamId, roomId }) {
  const res = await fetch(`${BASE_URL}/rooms/to-human-agent`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ team: teamId, roomId }),
  });

  if (res.status === 204) {
    console.log(`[omnichat] Room ${roomId} transferred to human agent`);
  } else {
    const err = await res.json().catch(() => ({}));
    console.error(`[omnichat] transferToHuman failed ${res.status}:`, err.errorCode);
  }
}

/**
 * Close a room (AI Chat → Closed).
 */
async function closeRoom({ teamId, roomId }) {
  const res = await fetch(`${BASE_URL}/rooms/close`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ team: teamId, roomId }),
  });

  if (res.status === 204) {
    console.log(`[omnichat] Room ${roomId} closed`);
  } else {
    const err = await res.json().catch(() => ({}));
    console.error(`[omnichat] closeRoom failed ${res.status}:`, err.errorCode);
  }
}

module.exports = { sendMessage, transferToHuman, closeRoom };
