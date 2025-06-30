import { Dispatch } from 'react';
import type { Action } from '../state/types';

const WEBSOCKET_URL = "ws://localhost:8000/api/v1/ws";

class WebSocketClient {
	private socket: WebSocket | null = null;
	private dispatch: Dispatch<Action> | null = null;

	public connect(dispatch: Dispatch<Action>) {
		console.log("%c[WebSocket] Attempting to connect...", "color: gray");

		// Ensure we don't have multiple connections
		if (this.socket && this.socket.readyState < 2) {
			console.warn("[WebSocket] Connection already exists.");
			return;
		}

		this.dispatch = dispatch;
		this.socket = new WebSocket(WEBSOCKET_URL);

		// --- We are attaching event listeners directly to be 100% sure they are set ---

		this.socket.onopen = (event) => {
			console.log("%c[WebSocket] ✔️ Connection OPEN.", "color: green; font-weight: bold;", event);
		};

		this.socket.onmessage = (event: MessageEvent) => {
			// THIS IS THE MOST IMPORTANT LOG. If this doesn't appear, the browser is not receiving the message.
			console.log("%c[WebSocket] 📩 MESSAGE RECEIVED FROM SERVER:", "color: orange; font-weight: bold;", event.data);

			if (!this.dispatch) {
				console.error("[WebSocket] Dispatch function is not available. Cannot process message.");
				return;
			}

			try {
				const message = JSON.parse(event.data);
				const actionType = message.type?.toUpperCase();

				if (actionType && message.payload) {
					console.log(`%c[WebSocket] 👉 Dispatching action: ${actionType}`, "color: yellow;", message.payload);
					this.dispatch({ type: actionType, payload: message.payload });
				} else {
					console.error("[WebSocket] Received message object is invalid:", message);
				}
			} catch (error) {
				console.error("[WebSocket] Failed to parse JSON from message:", error);
			}
		};

		this.socket.onerror = (event) => {
			console.error("[WebSocket] ❌ AN ERROR OCCURRED:", event);
		};

		this.socket.onclose = (event) => {
			console.warn(`[WebSocket] 🔌 Connection CLOSED. Code: ${event.code}, Reason: ${event.reason}. Reconnecting...`);
			// Simple reconnect logic
			setTimeout(() => this.connect(dispatch), 2000);
		};
	}

	// Use this function to send prompts from the chat
	public sendPrompt(prompt: string, selectionContext: string[] | null) {
		const message = { type: "user_prompt", payload: { text: prompt, selected_ids: selectionContext } };
		console.log("%c[WebSocket] 🚀 SENDING PROMPT TO SERVER:", "color: pink;", message);
		this.sendMessage(message);
	}

	// Generic sender
	private sendMessage(message: object) {
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify(message));
		} else {
			console.error("[WebSocket] Cannot send message, socket is not open. State:", this.socket?.readyState);
		}
	}

	// --- Direct command methods ---
	public sendElementUpdate(updatePayload: { id: string, [key: string]: any }) { this.sendMessage({ type: "update_element", payload: updatePayload }); }
	public sendUngroupElement(id: string) { this.sendMessage({ type: "ungroup_element", payload: { id } }); }
	public sendGroupElements(ids: string[]) { this.sendMessage({ type: "group_elements", payload: { ids } }); }
	public sendReorderElement(id: string, command: string) { this.sendMessage({ type: "reorder_element", payload: { id, command } }); }
	// --- ADD THIS NEW METHOD ---
	public sendCreateElement(elementData: object) {
		this.sendMessage({ type: "create_element", payload: elementData });
	}
}

export const webSocketClient = new WebSocketClient();
