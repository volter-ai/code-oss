/*
 * The editor's notifications are the workbench's: `mountVolter` is handed this `notify` in its `frame` argument, and
 * each notification is one `INotificationService.notify`, whose handle the editor keeps for its by-id dismiss and its
 * `onDismiss` (`onDidClose`). Code-OSS has no notification contribution point; replace-by-id is the service's own, as
 * a notification whose `id` matches a showing one closes it (`NotificationsModel.addNotification`).
 *
 * Map actions with keeps=true to secondary actions, which leave the toast open; primary actions close
 * it. Join detail to the title because the native message is string | Error, then let the toast expand
 * long messages. VolterNotification mirrors the editor's payload without importing editor modules.
 */

import Severity from '../../../../base/common/severity.js';
import { localize } from '../../../../nls.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { INotificationHandle, INotificationService } from '../../../../platform/notification/common/notification.js';

/** Notification payload shared with the editor. Native toasts own their auto-hide timing. */
export interface VolterNotification {
	readonly id: string;
	readonly tone: 'info' | 'warning' | 'error';
	readonly title: string;
	readonly detail?: string;
	readonly actions?: readonly { readonly label: string; readonly run: () => void; readonly keeps?: boolean }[];
	readonly sticky?: boolean;
	/** The toast's "Source:" line — the served product's display name. */
	readonly source?: string;
}

function severityOf(tone: VolterNotification['tone']): Severity {
	switch (tone) {
		case 'error': return Severity.Error;
		case 'warning': return Severity.Warning;
		default: return Severity.Info;
	}
}

/** The `notify` `mountVolter` is handed: one native notification per call. */
export function volterNotify(notificationService: INotificationService): (notification: VolterNotification) => INotificationHandle {
	return notification => {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		for (const [index, action] of (notification.actions ?? []).entries()) {
			// `keeps` IS VS Code's secondary action: "a notification does not close
			// automatically when invoking a secondary action" (INotificationActions).
			(action.keeps ? secondary : primary).push(toAction({
				id: `volter.notification.${notification.id}.${index}`,
				label: action.label,
				run: () => action.run(),
			}));
		}
		return notificationService.notify({
			id: `volter.${notification.id}`,
			severity: severityOf(notification.tone),
			message: notification.detail ? `${notification.title} — ${notification.detail}` : notification.title,
			source: notification.source ?? localize('volterNotificationSource', "Editor"),
			sticky: notification.sticky,
			...(primary.length || secondary.length ? { actions: { primary, secondary } } : {}),
		});
	};
}
