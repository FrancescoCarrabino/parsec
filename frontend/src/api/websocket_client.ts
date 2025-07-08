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
                
                // --- MODIFIED: Use a switch for clarity and safety ---
                // The backend sends snake_case, so we match on that.
                // We dispatch with the SCREAMING_SNAKE_CASE that our reducer expects.
				switch (message.type) {
                    case 'SET_WORKSPACE_STATE':
                    case 'ELEMENT_CREATED':
                    case 'ELEMENTS_CREATED': // Handle the new batch creation message
                    case 'ELEMENT_UPDATED':
                    case 'ELEMENTS_UPDATED':
                    case 'ELEMENT_DELETED':
                    case 'COMPONENT_DEFINITION_CREATED':
                    case 'WORKSPACE_RESET': // Handle the reset message for Undo/Redo
                    case 'AGENT_STATUS_UPDATE': // <-- ADDED: Handle the new status update message
                        console.log(`%c[WebSocket] 📩 Dispatching: ${message.type.toUpperCase()}`, "color: orange;", message.payload);
                        this.dispatch({ type: message.type.toUpperCase(), payload: message.payload });
                        break;
                    default:
                        // This handles cases where the backend sends a message type the frontend doesn't have a reducer for.
                        console.warn(`[WebSocket] Received unhandled message type: ${message.type}`);
                        break;
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
            // Avoid an infinite loop of immediate reconnection attempts if the server is down
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

	// --- All public command methods remain exactly the same ---
	public sendPrompt(prompt: string, selectionContext: string[] | null) { this.sendMessage({ type: "user_prompt", payload: { text: prompt, selected_ids: selectionContext } }); }
	public sendCreateElement(elementData: object) { this.sendMessage({ type: "create_element", payload: elementData }); }
	public sendElementUpdate(updatePayload: { id: string, [key: string]: any }, commitHistory: boolean = true) {
        const payloadWithHistory = { ...updatePayload, commitHistory };
        this.sendMessage({ type: "update_element", payload: payloadWithHistory });
    }
	public sendDeleteElement(id: string) { this.sendMessage({ type: "delete_element", payload: { id } }); }
	public sendGroupElements(ids: string[]) { this.sendMessage({ type: "group_elements", payload: { ids } }); }
	public sendUngroupElement(id: string) { this.sendMessage({ type: "ungroup_element", payload: { id } }); }
	public sendReparentElement(childId: string, newParentId: string | null) { this.sendMessage({ type: "reparent_element", payload: { childId, newParentId } }); }
	public sendReorderElement(id: string, command: string) { this.sendMessage({ type: "reorder_element", payload: { id, command } }); }
	public sendReorderLayer(draggedId: string, targetId: string, position: 'above' | 'below') { this.sendMessage({ type: "reorder_layer", payload: { draggedId, targetId, position } }); }
    public sendUpdatePresentationOrder(payload: { action: 'set', ordered_frame_ids: string[] } | { action: 'add', frame_id: string }) { this.sendMessage({ type: "update_presentation_order", payload: payload }); }
    public sendReorderSlide(draggedId: string, targetId: string, position: 'above' | 'below') { this.sendMessage({ type: "reorder_slide", payload: { dragged_id: draggedId, target_id: targetId, position: position }}); }
    public sendUndo() { this.sendMessage({ type: "undo", payload: {} }); }
    public sendRedo() { this.sendMessage({ type: "redo", payload: {} }); }
    public sendCreateElementsBatch(elements: object[]) { this.sendMessage({ type: "create_elements_batch", payload: { elements } }); }
}

export const webSocketClient = new WebSocketClient();