# SwipeRight Offers (browser extension)

Targeted card offers and credit usage exist only behind your bank login, and
no bank sells them. This extension reads the offers page you already have open
and does two things there:

- **Add all offers**: presses every "Add to card" / "Add offer" button on the
  page, at a person's pace, so no offer sits there paying nothing.
- **Sync to SwipeRight**: sends the page's text to your SwipeRight account,
  where the same parsers as the paste box read your offers, which ones are
  added, their expiry dates, and credit usage like "$290 of $300 used".

When one sync can't tell which of your cards a page belongs to (two Chase
cards, say), it asks once and remembers the card's last four digits.

## Privacy and security

- It never sees or stores your bank password, and it never logs in for you.
- It runs only when you click it (the `activeTab` permission). There is no
  background script and nothing runs on bank pages by itself.
- It talks to one place: your SwipeRight server. It sends the page text and
  the page address, nothing else.
- It holds its own token, made by typing a one-time code from the app. That
  token can only sync portal pages and read your card list. It cannot see
  your profile or change your account. Revoke it any time from the app
  (Account & security), or with **Disconnect** in the extension.

## Install (Chrome, Edge, Brave, Arc)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this `extension` folder.
3. In SwipeRight, open the account menu, **Account & security**, **Connect a browser**.
4. Click the SwipeRight icon in the toolbar and type the code.

For a release build, set `DEFAULT_SERVER` at the top of `popup.js` to the
deployed address (e.g. `https://<env>-<app-id>.encr.app` or your own domain),
then zip the folder for the Chrome Web Store. Addresses on `*.encr.app` and
localhost work without extra prompts; any other address asks for permission
once, when you connect.

## Safari (Mac, iPhone, iPad)

Safari runs the same code after Apple's converter wraps it in an app:

```bash
xcrun safari-web-extension-converter extension --app-name "SwipeRight Offers"
```

Open the generated Xcode project, build, then turn the extension on in
Safari's settings. On iPhone it works in Safari on the bank's website; for the
bank's own app, use a screenshot in SwipeRight instead (Insights, the card,
**Update**, **Screenshot instead**).

## Supported portals

Chase, American Express, Bank of America, Citi, Capital One, Discover, Wells
Fargo and U.S. Bank pages are accepted. The parsers are tuned on real Chase
and Amex offer pages; others go through the same reader with a model fallback.
