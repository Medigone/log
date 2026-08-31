/* Service worker du portail client IntraPro — push + ouverture des liens. */
var ICON_URL = "/assets/log/pwa/icon-192.png";
var BADGE_URL = "/assets/log/pwa/icon-192.png";
var DEFAULT_URL = "/client";

self.addEventListener("install", function (event) {
	self.skipWaiting();
});

self.addEventListener("activate", function (event) {
	event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
	var payload = { title: "IntraPro", body: "", url: DEFAULT_URL };
	try {
		if (event.data) {
			var parsed = event.data.json();
			if (parsed && typeof parsed === "object") {
				if (parsed.title) payload.title = parsed.title;
				if (parsed.body) payload.body = parsed.body;
				if (parsed.url) payload.url = parsed.url;
			}
		}
	} catch (error) {
		try {
			if (event.data) payload.body = event.data.text();
		} catch (textError) {
			payload.body = "";
		}
	}
	event.waitUntil(
		self.registration.showNotification(payload.title, {
			body: payload.body,
			icon: ICON_URL,
			badge: BADGE_URL,
			data: { url: payload.url },
		})
	);
});

self.addEventListener("notificationclick", function (event) {
	event.notification.close();
	var url = (event.notification.data && event.notification.data.url) || DEFAULT_URL;
	event.waitUntil(
		self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windowClients) {
			for (var i = 0; i < windowClients.length; i++) {
				var client = windowClients[i];
				if (client.url.indexOf("/client") !== -1 && "focus" in client) {
					client.focus();
					if (typeof client.navigate === "function") {
						return client.navigate(url);
					}
					return client;
				}
			}
			if (self.clients.openWindow) {
				return self.clients.openWindow(url);
			}
			return undefined;
		})
	);
});
