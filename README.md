# @lawlzer/10-minute-mail

10-minute-mail is an NPM package that makes access to temporary emails extremely easily, with extremely generous rate limits. (8 requests/second, unlimited emails)

This package simply uses the [10-minute-mail](https://docs.mail.gw) API. I am not affiliated with them or anything similar, I simply like their API.

## Getting Started

```bash
npm i @lawlzer/10-minute-mail
```

## Usage

```typescript
// // If you are using TypeScript/ESM
// import { Email } from '@lawlzer/10-minute-mail';

// // If you are using JavaScript/CJS
// const { Email } = require('@lawlzer/10-minute-mail');

(async () => {
	// new Email().getMessages(); // Error - All functions are guarded and fully type-safe, to ensure init() has been called first.

	// This will fully generate a new email address, password, and JWT (for the API).
	const email = await new Email().init();
	const { address, password, jwt } = email;
	console.log('address: ', address); // something@somewhere.com -- Randomly generated email address.

	// Get all messages (Will only get the most recent 30)
	const allMessages = await email.getMessages();

	// Will repeatedly get the most recent messages, until there is a new one. Will try for 1 minute at most.
	const newMessage = await email.awaitNewMessage();

	// You can pass "true" to awaitNewMessage to get additional information about the message (cc, bcc, lots of additional stuff)
	const newMessagePlusAdditionalInformation = await email.awaitNewMessage(true);

	// CURRENTLY NOT IMPLEMENTED!
	// Will download all attachments to the OS %temp% folder, and return an array of paths to each attachment.
	const attachmentPaths = await email.downloadAttachments(newMessage.id);
})();
```

## Contributing

Pull requests are extremely welcome! Simply make a PR and I'll happily take a look into it :)
