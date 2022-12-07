import { getRandomCharacters, returnRandomElement, sleep, throwError } from '@lawlzer/helpers';
import type { AxiosRequestConfig } from 'axios';
import axios from 'axios';
import ms from 'ms';
import { z } from 'zod';

const BASE_URL = 'https://api.mail.gw';

const DomainZod = z.object({
	id: z.string(),
	domain: z.string(),
});
type Domain = z.infer<typeof DomainZod>;

export interface Account {
	address: string; // Username @ Domain
	password: string;
}

export interface GetMessagesRequestResponse {
	'@context': string;
	'@id': string;
	'@type': string;
	'hydra:member': Message[];
	'hydra:totalItems': number;
}

// GET /messages/:id    -  This has more information than simple GET /messages
export interface GetMessageIdRequestResponse {
	'@context': string;
	'@id': string;
	'@type': string;
	id: string;
	accountId: string;
	msgid: string;
	from: {
		address: string;
		name: string;
	};
	to: {
		address: string;
		name: string;
	}[];
	cc: {
		address: string;
		name: string;
	}[];
	bcc: {
		address: string;
		name: string;
	}[];
	subject: string;
	seen: boolean;
	flagged: boolean;
	isDeleted: boolean;
	verifications: string[];
	retention: boolean;
	retentionDate: string;
	text: string;
	html: string[];
	hasAttachments: boolean;
	attachments: Attachment[];
	size: number;
	downloadUrl: string;
	createdAt: string;
	updatedAt: string;
}

export interface Attachment {
	id: string;
	filename: string;
	contentType: string;
	disposition: string;
	transferEncoding: string;
	related: boolean;
	size: number;
	downloadUrl: string;
}

export interface Message {
	'@id': string;
	'@type': string;
	id: string;
	accountId: string;
	msgid: string;
	from: {
		address: string;
		name: string;
	};
	to: {
		address: string;
		name: string;
	}[];
	subject: string;
	intro: string;
	seen: boolean;
	isDeleted: boolean;
	hasAttachments: boolean;
	size: number;
	downloadUrl: string;
	createdAt: string;
	updatedAt: string;
}

async function axiosCustom(input: AxiosRequestConfig<any>, start = Date.now()): Promise<any> {
	try {
		const response = await axios(input);
		return response.data;
	} catch (e: any) {
		// Rate limited, wait 1s and try again
		if (e?.response?.status === 429) {
			await sleep(1000);

			if (Date.now() - start > ms('30s')) throwError('We have been rate limited for 30 seconds. Please file an issue, or stop being rate limited :P');
			return axiosCustom(input, start);
		}

		console.debug('axiosCustom input: ', input);
		console.debug('e: ', e);

		throwError('We received an unexpected Response status. Please file an issue.');
	}
}

async function getDomains(): Promise<Domain[]> {
	const data = await axiosCustom({
		method: 'get',
		url: `${BASE_URL}/domains`,
		// There is only one domain, no need to crawl multiple pages
		// data: {
		// 	page: 1,
		// },
	});

	const domains = data?.['hydra:member'];
	if (!domains || domains.length === 0) throwError('No domains found. Please create an issue.');

	const domainsClean: Domain[] = domains.map((inputDomain: unknown) => {
		const domain = DomainZod.parse(inputDomain);
		return domain;
	});

	return domainsClean;
}

async function createAccount(domain: Domain): Promise<Account> {
	const accountInformation: Account = {
		address: `${getRandomCharacters(20, { letters: true }).toLowerCase()}@${domain.domain}`,
		password: getRandomCharacters(20, { letters: true, symbols: false }),
	};

	try {
		const data = await axiosCustom({
			method: 'post',
			url: `${BASE_URL}/accounts`,
			data: accountInformation,
		});
		return accountInformation;
	} catch (e: any) {
		console.debug('e: ', e);

		throwError(`We received an error in createAccount. Please create an issue. e: ${e}`);
	}
}

interface EmailInterface {
	address: string;
	password: string;
	jwt?: string;
}

export class Email implements Partial<EmailInterface> {
	address?: string;
	password?: string;
	jwt?: string;

	constructor() {}

	public async init() {
		const domains = await getDomains();
		const account = await createAccount(returnRandomElement(domains));
		this.address = account.address;
		this.password = account.password;

		// I don't think there is a better way to do this, because we cannot update "this" without returning it
		await (this as this & Pick<EmailInterface, 'address' | 'password' | 'jwt'>).refreshJWT();

		return this as this & Required<Pick<EmailInterface, 'address' | 'password' | 'jwt'>>;
	}

	public async refreshJWT(this: this & { address: string; password: string }) {
		try {
			const data = await axiosCustom({
				method: 'post',
				url: `${BASE_URL}/token`,
				data: this.getApiAccount(),
			});

			this.jwt = data.token;
		} catch (e: any) {
			console.debug('e: ', e);
			throwError('We received an error in refreshJWT. Please create an issue.');
		}
	}

	public async awaitNewMessage(this: this & Required<Pick<Email, 'jwt'>>): Promise<Message>;
	public async awaitNewMessage(this: this & Required<Pick<Email, 'jwt'>>, additionalInformation: true): Promise<GetMessageIdRequestResponse>;
	public async awaitNewMessage(this: this & Required<Pick<Email, 'jwt'>>, getAdditionalinformation?: boolean): Promise<Message | GetMessageIdRequestResponse> {
		const messages = await this.getMessages();
		const messagesAmountInitial = messages['hydra:totalItems'];

		// Try for 1 minute
		const start = Date.now();
		while (Date.now() - start < ms('1m')) {
			await sleep(200);
			const messages = await this.getMessages();
			const messagesAmountCurrent = messages['hydra:totalItems'];
			if (messagesAmountCurrent > messagesAmountInitial && !getAdditionalinformation) return await this.getMessageById(messages['hydra:member'][0]['id']);
			if (messagesAmountCurrent > messagesAmountInitial && getAdditionalinformation) return messages['hydra:member'][0];
		}
		throwError('awaitNewMessage was called, but no new messages were received in 1 minute.');
	}

	public async getMessages(this: this & Required<Pick<Email, 'jwt'>>): Promise<GetMessagesRequestResponse> {
		try {
			const messages: GetMessagesRequestResponse = await axiosCustom({
				method: 'get',
				url: `${BASE_URL}/messages`,
				headers: {
					Authorization: `Bearer ${this.jwt || throwError('getMessages called without this.jwt being initialized. Please call email.init() first.')}`,
				},
			});

			return messages;
		} catch (e: any) {
			console.debug('e: ', e);
			throwError('We received an error in getMessages. Please create an issue.');
		}
	}

	private getApiAccount(this: this & Required<Pick<Email, 'address' | 'password'>>) {
		return {
			address: this.address || throwError('private getApiAccount called without this.address being initialized. Please call email.init() first.'),
			password: this.password || throwError('private getApiAccount called without this.password being initialized. Please call email.init() first.'),
		};
	}

	private async getMessageById(this: this & Required<Pick<Email, 'jwt'>>, messageId: string): Promise<GetMessageIdRequestResponse> {
		const message: GetMessageIdRequestResponse = await axiosCustom({
			method: 'get',
			url: `${BASE_URL}/messages/${messageId}`,
			headers: {
				Authorization: `Bearer ${this.jwt || throwError('getMessageById called without this.jwt being initialized. Please call email.init() first.')}`,
			},
		});
		return message;
	}

	/**
	 * This will download all attachments to the %temp% folder, and return the path to each attachment.
	 */
	public async downloadAttachments(this: this & Required<Pick<Email, 'jwt'>>, messageId: string) {
		const message = await this.getMessageById(messageId);

		const attachmentFilepaths = await Promise.all(
			message.attachments.map(async (attachment) => {
				return await this.downloadAttachment(attachment.downloadUrl);
			})
		);

		return attachmentFilepaths;
	}

	/**
	 * downloadAttachment is temporarily disabled. It is not working and must be looked into.
	 */
	// @ts-expect-error
	private async downloadAttachment(downloadUrl: string): Promise<string> {
		const data = await axiosCustom({
			method: 'get',
			url: `${BASE_URL}${downloadUrl}`, // downloadUrl starts with a /, no need to add one
			headers: {
				Authorization: `Bearer ${this.jwt || throwError('downloadAttachment called without this.jwt being initialized. Please call email.init() first.')}`,
			},
			responseType: 'arraybuffer',
		});
	}
}
