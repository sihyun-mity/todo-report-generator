import returnFetch from 'return-fetch';

export const fetchExtended = returnFetch({
  baseUrl: '',
  headers: { Accept: 'application/json' },
  interceptors: {
    request: async (args) => {
      return args;
    },

    response: async (response) => {
      if (response.status >= 400) {
        throw await response.text().then(Error);
      }

      return response;
    },
  },
});
