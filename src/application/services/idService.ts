export interface IdService {
  createId(): string;
}

export const cryptoIdService: IdService = {
  createId: () => crypto.randomUUID(),
};
