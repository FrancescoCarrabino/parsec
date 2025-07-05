// parsec-frontend/src/api/websocket_client.ts

import { Dispatch } from 'react';
import type { Action } from '../state/types';

const WEBSOCKET_URL = "ws://localhost:8000/api/v1/ws";

class WebSocketClient {
	private socket: WebSocket | null = null;
	private dispatch: Dispatch<Action> | null = null;

	public connect(dispatch: Dispatch<Action>) {
		if (this.socket && this.socket.readyState < 2) {
			console.warn("[WebSocket] Connection already exists.");
			return;
		}

		this.dispatch = dispatch;
		this.socket = new WebSocket(WEBSOCKET_URL);

		this.socket.onopen = (event) => {
			console.log("%c[WebSocket] ✔️ Connection OPEN.", "color: green; font-weight: bold;", event);
		};

		this.socket.onmessage = (event: MessageEvent) => {
			if (!this.dispatch) return;
			try {
				const message = JSON.parse(event.data);
                // The backend sends snake_case, so we convert it to the reducer's expected SCREAMING_SNAKE_CASE
				const actionType = message.type?.toUpperCase();
				if (actionType && message.payload) {
					console.log(`%c[WebSocket] 📩 Dispatching: ${actionType}`, "color: orange;", message.payload);
					this.dispatch({ type: actionType, payload: message.payload });
				}
			} catch (error) {
				console.error("[WebSocket] Failed to parse JSON from message:", error, event.data);
			}
		};

		this.socket.onerror = (event) => {
			console.error("[WebSocket] ❌ AN ERROR OCCURRED:", event);
		};

		this.socket.onclose = (event) => {
			console.warn(`[WebSocket] 🔌 Connection CLOSED. Code: ${event.code}. Reconnecting...`);
			setTimeout(() => this.connect(dispatch), 2000);
		};
	}

	private sendMessage(message: object) {
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify(message));
		} else {
			console.error("[WebSocket] Cannot send message, socket is not open. State:", this.socket?.readyState);
		}
	}

	// --- Direct User Action Commands ---
	public sendPrompt(prompt: string, selectionContext: string[] | null) { this.sendMessage({ type: "user_prompt", payload: { text: prompt, selected_ids: selectionContext } }); }
	public sendCreateElement(elementData: object) { this.sendMessage({ type: "create_element", payload: elementData }); }
	public sendElementUpdate(updatePayload: { id: string, [key: string]: any }) { this.sendMessage({ type: "update_element", payload: updatePayload }); }
	public sendDeleteElement(id: string) { this.sendMessage({ type: "delete_element", payload: { id } }); }
	
	// --- Grouping and Hierarchy Commands ---
	public sendGroupElements(ids: string[]) { this.sendMessage({ type: "group_elements", payload: { ids } }); }
	public sendUngroupElement(id: string) { this.sendMessage({ type: "ungroup_element", payload: { id } }); }
	public sendReparentElement(childId: string, newParentId: string | null) { this.sendMessage({ type: "reparent_element", payload: { childId, newParentId } }); }
	
	// --- Stacking and Ordering Commands ---
	public sendReorderElement(id: string, command: string) { this.sendMessage({ type: "reorder_element", payload: { id, command } }); }
	public sendReorderLayer(draggedId: string, targetId: string, position: 'above' | 'below') { this.sendMessage({ type: "reorder_layer", payload: { draggedId, targetId, position } }); }

    public sendUpdatePresentationOrder(payload: { action: 'set', ordered_frame_ids: string[] } | { action: 'add', frame_id: string }) {
        this.sendMessage({
            type: "update_presentation_order",
            payload: payload,
        });
    }
    public sendReorderSlide(draggedId: string, targetId: string, position: 'above' | 'below') {
        this.sendMessage({
            type: "reorder_slide",
            payload: {
                dragged_id: draggedId,
                target_id: targetId,
                position: position,
            },
        });
    }

	// --- REMOVED METHODS ---
	// The methods `sendUpdatePathPoint` and `sendMovePathPoints` have been removed.
	// The new `usePathEditor` will use the robust `sendElementUpdate` command instead,
	// which simplifies both frontend and backend logic.
}

export const webSocketClient = new WebSocketClient();