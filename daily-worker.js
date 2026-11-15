/* Maple Match - works out today's Daily Sap Run move budget off the main thread (see MMAI.budgetDaily). */
importScripts('rules.js', 'levels.js', 'ai.js');
onmessage = e => { const key = e.data; postMessage({ key, moves: self.MMAI.makeDaily(key).moves }); };
