'use client';
import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
    useEffect(() => {
        if (
            typeof window === 'undefined' ||
            !('serviceWorker' in navigator) ||
            process.env.NODE_ENV !== 'production'
        ) {
            return;
        }

        // A worker was already controlling this page, so a controller swap means an
        // older worker was replaced. Reload once so the document and its chunks come
        // from the same deployment.
        const hadController = Boolean(navigator.serviceWorker.controller);
        let reloaded = false;

        const onControllerChange = () => {
            if (!hadController || reloaded) return;
            reloaded = true;
            window.location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

        const registerSW = async () => {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js', {
                    scope: '/',
                    updateViaCache: 'none',
                });

                await registration.update();

                setInterval(() => {
                    registration.update();
                }, 60 * 60 * 1000);
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        };

        if (document.readyState === 'complete') {
            registerSW();
        } else {
            window.addEventListener('load', registerSW);
        }

        return () => {
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        };
    }, []);

    return null;
}
