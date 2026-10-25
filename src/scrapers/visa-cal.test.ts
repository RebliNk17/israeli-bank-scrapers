import { CompanyTypes, SCRAPERS } from '../definitions';
import * as fetchHelper from '../helpers/fetch';
import { exportTransactions, extendAsyncTimeout, getTestsConfig, maybeTestCompanyAPI } from '../tests/tests-utils';
import { LoginResults } from './base-scraper-with-browser';
import VisaCalScraper from './visa-cal';

const COMPANY_ID = CompanyTypes.visaCal; // TODO this property should be hard-coded in the provider
const testsConfig = getTestsConfig();

describe('VisaCal legacy scraper', () => {
  beforeAll(() => {
    extendAsyncTimeout(); // The default timeout is 5 seconds per async test, this function extends the timeout value
  });

  test('should expose login fields in scrapers constant', () => {
    expect(SCRAPERS.visaCal).toBeDefined();
    expect(SCRAPERS.visaCal.loginFields).toContain('username');
    expect(SCRAPERS.visaCal.loginFields).toContain('password');
  });

  maybeTestCompanyAPI(COMPANY_ID, config => config.companyAPI.invalidPassword)(
    'should fail on invalid user/password"',
    async () => {
      const options = {
        ...testsConfig.options,
        companyId: COMPANY_ID,
      };

      const scraper = new VisaCalScraper(options);

      const result = await scraper.scrape({ username: '971sddksmsl', password: '3f3ssdkSD3d' });

      expect(result).toBeDefined();
      expect(result.success).toBeFalsy();
      expect(result.errorType).toBe(LoginResults.InvalidPassword);
    },
  );

  maybeTestCompanyAPI(COMPANY_ID)('should scrape transactions"', async () => {
    const options = {
      ...testsConfig.options,
      companyId: COMPANY_ID,
    };

    const scraper = new VisaCalScraper(options);
    const result = await scraper.scrape(testsConfig.credentials.visaCal);
    expect(result).toBeDefined();
    const error = `${result.errorType || ''} ${result.errorMessage || ''}`.trim();
    expect(error).toBe('');
    expect(result.success).toBeTruthy();
    // uncomment to test multiple accounts
    // expect(result?.accounts?.length).toEqual(2)
    exportTransactions(COMPANY_ID, result.accounts || []);
  });

  test('should support pure-HTTP mobile API via visaCal:useMobileApi optInFeature', async () => {
    const spy = jest.spyOn(fetchHelper, 'fetchPost').mockImplementation((url: string) => {
      if (url.endsWith('/Authentication/api/login/regularLogin')) {
        return Promise.resolve({
          statusCode: 1,
          result: {
            calConnectToken: 'test-cal-token',
            hash: 'test-bio-hash',
            temporaryGuid: 'test-guid-123',
          },
        });
      }
      if (url.endsWith('/Authentication/api/account/init')) {
        return Promise.resolve({
          statusCode: 1,
          result: {
            cards: [{ cardUniqueId: 'card-111', last4Digits: '1234' }],
          },
        });
      }
      if (url.endsWith('/Frames/api/Frames/GetTotalFrameStatus')) {
        return Promise.resolve({
          statusCode: 1,
          result: {
            calIssuedCards: {
              frameLimitForCardAmount: 20000,
              cardLevelFrames: [
                {
                  cardUniqueId: 'card-111',
                  nextDebitDate: '2026-11-02T00:00:00',
                  nextTotalDebit: 150.5,
                },
              ],
            },
          },
        });
      }
      if (url.endsWith('/Transactions/api/approvals/getClearanceRequests')) {
        return Promise.resolve({ statusCode: 96, result: null });
      }
      if (url.endsWith('/Transactions/api/transactionsDetails/getCardTransactionsDetails')) {
        return Promise.resolve({
          statusCode: 1,
          result: {
            bankAccounts: [],
          },
        });
      }
      return Promise.resolve({ statusCode: 1, result: {} });
    });

    try {
      const scraper = new VisaCalScraper({
        companyId: COMPANY_ID,
        startDate: new Date('2026-10-01'),
        futureMonthsToScrape: 0,
        optInFeatures: ['visaCal:useMobileApi'],
      });

      const result = await scraper.scrape({ username: 'user1', password: 'pw1' });
      expect(result.success).toBe(true);
      expect(scraper.mobileBioHash).toBe('test-bio-hash');
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts?.[0]?.accountNumber).toBe('1234');
      expect(result.accounts?.[0]?.balance).toBe(-150.5);
    } finally {
      spy.mockRestore();
    }
  });
});
