"use strict";
(() => {
  var __require = /* @__PURE__ */ ((x2) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x2, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x2)(function(x2) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x2 + '" is not supported');
  });

  // node_modules/@kittycad/oauth2-auth-code-pkce/index.js
  var Stage;
  (function(Stage2) {
    Stage2[Stage2["Initial"] = 0] = "Initial";
    Stage2[Stage2["GoingToAuthServer"] = 1] = "GoingToAuthServer";
    Stage2[Stage2["ReturnedFromAuthServer"] = 2] = "ReturnedFromAuthServer";
    Stage2[Stage2["AuthCodeBeenExchangedForAccessToken"] = 3] = "AuthCodeBeenExchangedForAccessToken";
    Stage2[Stage2["NeedsRefresh"] = 4] = "NeedsRefresh";
    Stage2[Stage2["Fetching"] = 5] = "Fetching";
    Stage2[Stage2["Authenticated"] = 6] = "Authenticated";
  })(Stage || (Stage = {}));
  var EErrorOAuth2;
  (function(EErrorOAuth22) {
    EErrorOAuth22["ErrorUnknown"] = "ErrorUnknown";
    EErrorOAuth22["ErrorNoAuthCode"] = "ErrorNoAuthCode";
    EErrorOAuth22["ErrorInvalidReturnedStateParam"] = "ErrorInvalidReturnedStateParam";
    EErrorOAuth22["ErrorInvalidJson"] = "ErrorInvalidJson";
    EErrorOAuth22["ErrorInvalidScope"] = "ErrorInvalidScope";
    EErrorOAuth22["ErrorInvalidRequest"] = "ErrorInvalidRequest";
    EErrorOAuth22["ErrorInvalidToken"] = "ErrorInvalidToken";
    EErrorOAuth22["ErrorAuthenticationGrant"] = "ErrorAuthenticationGrant";
    EErrorOAuth22["ErrorAccessTokenResponse"] = "ErrorAccessTokenResponse";
  })(EErrorOAuth2 || (EErrorOAuth2 = {}));
  var EErrorAuthenticationGrant;
  (function(EErrorAuthenticationGrant2) {
    EErrorAuthenticationGrant2["ErrorUnauthorizedClient"] = "ErrorUnauthorizedClient";
    EErrorAuthenticationGrant2["ErrorAccessDenied"] = "ErrorAccessDenied";
    EErrorAuthenticationGrant2["ErrorUnsupportedResponseType"] = "ErrorUnsupportedResponseType";
    EErrorAuthenticationGrant2["ErrorServerError"] = "ErrorServerError";
    EErrorAuthenticationGrant2["ErrorTemporarilyUnavailable"] = "ErrorTemporarilyUnavailable";
  })(EErrorAuthenticationGrant || (EErrorAuthenticationGrant = {}));
  var EErrorAccessTokenResponse;
  (function(EErrorAccessTokenResponse2) {
    EErrorAccessTokenResponse2["ErrorInvalidClient"] = "ErrorInvalidClient";
    EErrorAccessTokenResponse2["ErrorInvalidGrant"] = "ErrorInvalidGrant";
    EErrorAccessTokenResponse2["ErrorUnsupportedGrantType"] = "ErrorUnsupportedGrantType";
  })(EErrorAccessTokenResponse || (EErrorAccessTokenResponse = {}));
  var RawErrorToOAuth2ErrorTypeMap = {
    invalid_json: {
      kind: EErrorOAuth2.ErrorInvalidJson
    },
    invalid_scope: {
      kind: EErrorOAuth2.ErrorInvalidScope
    },
    invalid_request: {
      kind: EErrorOAuth2.ErrorInvalidRequest
    },
    invalid_token: {
      kind: EErrorOAuth2.ErrorInvalidToken
    },
    invalid_grant: {
      kind: EErrorOAuth2.ErrorAccessTokenResponse,
      value: EErrorAccessTokenResponse.ErrorInvalidGrant
    },
    unauthorized_client: {
      kind: EErrorOAuth2.ErrorAuthenticationGrant,
      value: EErrorAuthenticationGrant.ErrorUnauthorizedClient
    },
    access_denied: {
      kind: EErrorOAuth2.ErrorAuthenticationGrant,
      value: EErrorAuthenticationGrant.ErrorAccessDenied
    },
    unsupported_response_type: {
      kind: EErrorOAuth2.ErrorAuthenticationGrant,
      value: EErrorAuthenticationGrant.ErrorUnsupportedResponseType
    },
    server_error: {
      kind: EErrorOAuth2.ErrorAuthenticationGrant,
      value: EErrorAuthenticationGrant.ErrorServerError
    },
    temporarily_unavailable: {
      kind: EErrorOAuth2.ErrorAuthenticationGrant,
      value: EErrorAuthenticationGrant.ErrorTemporarilyUnavailable
    },
    invalid_client: {
      kind: EErrorOAuth2.ErrorAccessTokenResponse,
      value: EErrorAccessTokenResponse.ErrorInvalidClient
    },
    unsupported_grant_type: {
      kind: EErrorOAuth2.ErrorAccessTokenResponse,
      value: EErrorAccessTokenResponse.ErrorUnsupportedGrantType
    }
  };
  function toErrorClass(rawError) {
    return RawErrorToOAuth2ErrorTypeMap[rawError] ?? { kind: EErrorOAuth2.ErrorUnknown };
  }
  function fromWWWAuthenticateHeaderStringToObject(a) {
    const obj = a.slice("Bearer ".length).replace(/"/g, "").split(", ").map((tokens) => {
      const [k2, v2] = tokens.split("=");
      return { [k2 ?? /* @__PURE__ */ Symbol()]: v2 };
    }).reduce((a2, c) => ({ ...a2, ...c }), {});
    return { realm: obj["realm"] ?? "missing", error: obj["error"] ?? "missing" };
  }
  var HEADER_AUTHORIZATION = "Authorization";
  var HEADER_WWW_AUTHENTICATE = "WWW-Authenticate";
  var LOCALSTORAGE_ID = `oauth2authcodepkce`;
  var LOCALSTORAGE_STATE = `${LOCALSTORAGE_ID}-state`;
  var RECOMMENDED_CODE_VERIFIER_LENGTH = 96;
  var RECOMMENDED_STATE_LENGTH = 32;
  var PKCE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  var OAuth2AuthCodePKCE = class _OAuth2AuthCodePKCE {
    config;
    state = {
      stage: Stage.Initial
    };
    authCodeForAccessTokenRequest;
    constructor(config) {
      this.config = config;
      this.recoverState();
      return this;
    }
    /**
     * Attach the OAuth logic to all fetch requests and translate errors (either
     * returned as json or through the WWW-Authenticate header) into nice error
     * classes.
     */
    decorateFetchHTTPClient(fetch2) {
      return (url, config, ...rest) => {
        if (!this.state.isHTTPDecoratorActive) {
          return fetch2(url, config, ...rest);
        }
        return this.getAccessToken().then((data) => {
          if (data === void 0 || data.token === void 0) {
            return Promise.reject(new Error("No token"));
          }
          const configNew = Object.assign({}, config);
          if (!configNew.headers) {
            configNew.headers = {};
          }
          configNew.headers[HEADER_AUTHORIZATION] = `Bearer ${data.token.value}`;
          return fetch2(url, configNew, ...rest);
        }).then((res) => {
          if (res.ok) {
            return res;
          }
          if (!res.headers.has(HEADER_WWW_AUTHENTICATE.toLowerCase())) {
            return res;
          }
          const error = toErrorClass(fromWWWAuthenticateHeaderStringToObject(res.headers.get(HEADER_WWW_AUTHENTICATE.toLowerCase())).error);
          if (error.kind === EErrorOAuth2.ErrorInvalidToken && this.state.stage !== Stage.NeedsRefresh) {
            this.state.stage = Stage.NeedsRefresh;
            this.config.onAccessTokenExpiry(() => this.exchangeRefreshTokenForAccessToken());
          }
          return Promise.reject(error);
        });
      };
    }
    /**
     * If there is an error, it will be passed back as a rejected Promise.
     * If there is no code, the user should be redirected via
     * [fetchAuthorizationCode].
     */
    isReturningFromAuthServer() {
      const error = _OAuth2AuthCodePKCE.extractParamFromUrl(location.href, "error");
      if (error) {
        return Promise.reject(toErrorClass(error));
      }
      const state = JSON.parse(localStorage.getItem(LOCALSTORAGE_STATE) || "{}");
      if (state.stage !== Stage.GoingToAuthServer) {
        return Promise.resolve(false);
      }
      const code = _OAuth2AuthCodePKCE.extractParamFromUrl(location.href, "code");
      if (!code) {
        return Promise.resolve(false);
      }
      const stateQueryParam = _OAuth2AuthCodePKCE.extractParamFromUrl(location.href, "state");
      if (stateQueryParam !== state.stateQueryParam) {
        console.warn("state query string parameter doesn't match the one sent! Possible malicious activity somewhere.");
        return Promise.reject({ kind: EErrorOAuth2.ErrorInvalidReturnedStateParam });
      }
      state.authorizationCode = code;
      state.stage = Stage.ReturnedFromAuthServer;
      localStorage.setItem(LOCALSTORAGE_STATE, JSON.stringify(state));
      this.setState(state);
      return Promise.resolve(true);
    }
    /**
     * Fetch an authorization grant via redirection. In a sense this function
     * doesn't return because of the redirect behavior (uses `location.replace`).
     *
     * @param oneTimeParams A way to specify "one time" used query string
     * parameters during the authorization code fetching process, usually for
     * values which need to change at run-time.
     */
    async fetchAuthorizationCode(oneTimeParams) {
      this.assertStateAndConfigArePresent();
      const { clientId, extraAuthorizationParams, redirectUrl, scopes } = this.config;
      const { codeChallenge, codeVerifier } = await _OAuth2AuthCodePKCE.generatePKCECodes();
      const stateQueryParam = _OAuth2AuthCodePKCE.generateRandomState(RECOMMENDED_STATE_LENGTH);
      this.state = {
        ...this.state,
        stage: Stage.GoingToAuthServer,
        codeChallenge,
        codeVerifier,
        stateQueryParam,
        isHTTPDecoratorActive: true
      };
      localStorage.setItem(LOCALSTORAGE_STATE, JSON.stringify(this.state));
      let url = this.config.authorizationUrl + `?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUrl)}&scope=${encodeURIComponent(scopes.join(" "))}&state=${stateQueryParam}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256`;
      if (extraAuthorizationParams || oneTimeParams) {
        const extraParameters = {
          ...extraAuthorizationParams,
          ...oneTimeParams
        };
        url = `${url}&${_OAuth2AuthCodePKCE.objectToQueryString(extraParameters)}`;
      }
      location.replace(url);
    }
    /**
     * Tries to get the current access token. If there is none
     * it will fetch another one. If it is expired, it will fire
     * [onAccessTokenExpiry] but it's up to the user to call the refresh token
     * function. This is because sometimes not using the refresh token facilities
     * is easier.
     */
    getAccessToken() {
      this.assertStateAndConfigArePresent();
      const { onAccessTokenExpiry } = this.config;
      const { accessToken, authorizationCode, explicitlyExposedTokens, stage, refreshToken, scopes } = this.state;
      if (!authorizationCode) {
        return Promise.reject({ kind: EErrorOAuth2.ErrorNoAuthCode });
      }
      if (this.authCodeForAccessTokenRequest) {
        return this.authCodeForAccessTokenRequest;
      }
      if (!this.isAuthorized() || stage < Stage.AuthCodeBeenExchangedForAccessToken) {
        this.authCodeForAccessTokenRequest = this.exchangeAuthCodeForAccessToken();
        return this.authCodeForAccessTokenRequest;
      }
      if (refreshToken && this.isAccessTokenExpired() && stage !== Stage.Fetching) {
        this.state.stage = Stage.Fetching;
        return onAccessTokenExpiry(() => this.exchangeRefreshTokenForAccessToken());
      }
      return Promise.resolve({
        token: accessToken,
        explicitlyExposedTokens,
        scopes,
        refreshToken
      });
    }
    /**
     * Refresh an access token from the remote service.
     */
    exchangeRefreshTokenForAccessToken() {
      this.assertStateAndConfigArePresent();
      const { extraRefreshParams, clientId, tokenUrl } = this.config;
      const { refreshToken } = this.state;
      if (!refreshToken) {
        console.warn("No refresh token is present.");
      }
      const url = tokenUrl;
      let body = `grant_type=refresh_token&refresh_token=${refreshToken?.value}&client_id=${clientId}`;
      if (extraRefreshParams) {
        body = `${url}&${_OAuth2AuthCodePKCE.objectToQueryString(extraRefreshParams)}`;
      }
      return fetch(url, {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }).then((res) => res.status >= 400 ? res.json().then((data) => Promise.reject(data)) : res.json()).then((json) => {
        const { access_token, expires_in, refresh_token, scope } = json;
        const { explicitlyExposedTokens } = this.config;
        let scopes = [];
        let tokensToExpose = {};
        const accessToken = {
          value: access_token,
          expiry: new Date(Date.now() + parseInt(expires_in) * 1e3).toString()
        };
        this.state.accessToken = accessToken;
        if (refresh_token) {
          const refreshToken2 = {
            value: refresh_token
          };
          this.state.refreshToken = refreshToken2;
        }
        if (explicitlyExposedTokens) {
          tokensToExpose = Object.fromEntries(explicitlyExposedTokens.map((tokenName) => [tokenName, json[tokenName]]).filter(([_2, tokenValue]) => tokenValue !== void 0));
          this.state.explicitlyExposedTokens = tokensToExpose;
        }
        if (scope) {
          scopes = scope.split(" ");
          this.state.scopes = scopes;
        }
        localStorage.setItem(LOCALSTORAGE_STATE, JSON.stringify(this.state));
        let accessContext = { token: accessToken, scopes };
        if (explicitlyExposedTokens) {
          accessContext.explicitlyExposedTokens = tokensToExpose;
        }
        return accessContext;
      }).catch((data) => {
        const { onInvalidGrant } = this.config;
        const error = data.error || "There was a network error.";
        switch (error) {
          case "invalid_grant":
            onInvalidGrant(() => this.fetchAuthorizationCode());
            break;
          default:
            break;
        }
        return Promise.reject(toErrorClass(error));
      });
    }
    /**
     * Get the scopes that were granted by the authorization server.
     */
    getGrantedScopes() {
      return this.state.scopes;
    }
    /**
     * Signals if OAuth HTTP decorating should be active or not.
     */
    isHTTPDecoratorActive(isActive) {
      this.state.isHTTPDecoratorActive = isActive;
      localStorage.setItem(LOCALSTORAGE_STATE, JSON.stringify(this.state));
    }
    /**
     * Tells if the client is authorized or not. This means the client has at
     * least once successfully fetched an access token. The access token could be
     * expired.
     */
    isAuthorized() {
      return !!this.state.accessToken;
    }
    /**
     * Checks to see if the access token has expired.
     */
    isAccessTokenExpired() {
      const { accessToken } = this.state;
      return Boolean(accessToken && /* @__PURE__ */ new Date() >= new Date(accessToken.expiry));
    }
    /**
     * Resets the state of the client. Equivalent to "logging out" the user.
     */
    reset() {
      this.setState({
        stage: Stage.Initial
      });
      this.authCodeForAccessTokenRequest = void 0;
    }
    /**
     * If the state or config are missing, it means the client is in a bad state.
     * This should never happen, but the check is there just in case.
     */
    assertStateAndConfigArePresent() {
      if (!this.state || !this.config) {
        console.error("state:", this.state, "config:", this.config);
        throw new Error("state or config is not set.");
      }
    }
    /**
     * Fetch an access token from the remote service. You may pass a custom
     * authorization grant code for any reason, but this is non-standard usage.
     */
    exchangeAuthCodeForAccessToken(codeOverride) {
      this.assertStateAndConfigArePresent();
      const { authorizationCode = codeOverride, codeVerifier = "" } = this.state;
      const { clientId, onInvalidGrant, redirectUrl } = this.config;
      if (!codeVerifier) {
        console.warn("No code verifier is being sent.");
      } else if (!authorizationCode) {
        console.warn("No authorization grant code is being passed.");
      }
      const url = this.config.tokenUrl;
      const body = `grant_type=authorization_code&code=${encodeURIComponent(authorizationCode || "")}&redirect_uri=${encodeURIComponent(redirectUrl)}&client_id=${encodeURIComponent(clientId)}&code_verifier=${codeVerifier}`;
      return fetch(url, {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }).then((res) => {
        const jsonPromise = res.json().catch((_2) => ({ error: "invalid_json" }));
        if (!res.ok) {
          return jsonPromise.then(({ error }) => {
            switch (error) {
              case "invalid_grant":
                onInvalidGrant(() => this.fetchAuthorizationCode());
                break;
              default:
                break;
            }
            return Promise.reject(toErrorClass(error));
          });
        }
        return jsonPromise.then((json) => {
          const { access_token, expires_in, refresh_token, scope } = json;
          const { explicitlyExposedTokens } = this.config;
          let scopes = [];
          let tokensToExpose = {};
          this.state.stage = Stage.AuthCodeBeenExchangedForAccessToken;
          this.authCodeForAccessTokenRequest = void 0;
          const accessToken = {
            value: access_token,
            expiry: new Date(Date.now() + parseInt(expires_in) * 1e3).toString()
          };
          this.state.accessToken = accessToken;
          if (refresh_token) {
            const refreshToken = {
              value: refresh_token
            };
            this.state.refreshToken = refreshToken;
          }
          if (explicitlyExposedTokens) {
            tokensToExpose = Object.fromEntries(explicitlyExposedTokens.map((tokenName) => [tokenName, json[tokenName]]).filter(([_2, tokenValue]) => tokenValue !== void 0));
            this.state.explicitlyExposedTokens = tokensToExpose;
          }
          if (scope) {
            scopes = scope.split(" ");
            this.state.scopes = scopes;
          }
          localStorage.setItem(LOCALSTORAGE_STATE, JSON.stringify(this.state));
          let accessContext = { token: accessToken, scopes };
          if (explicitlyExposedTokens) {
            accessContext.explicitlyExposedTokens = tokensToExpose;
          }
          return accessContext;
        });
      });
    }
    recoverState() {
      this.state = JSON.parse(localStorage.getItem(LOCALSTORAGE_STATE) || "{}");
      return this;
    }
    setState(state) {
      this.state = state;
      localStorage.setItem(LOCALSTORAGE_STATE, JSON.stringify(state));
      return this;
    }
    /**
     * Implements *base64url-encode* (RFC 4648 § 5) without padding, which is NOT
     * the same as regular base64 encoding.
     */
    static base64urlEncode(value) {
      let base64 = btoa(value);
      base64 = base64.replace(/\+/g, "-");
      base64 = base64.replace(/\//g, "_");
      base64 = base64.replace(/=/g, "");
      return base64;
    }
    /**
     * Extracts a query string parameter.
     */
    static extractParamFromUrl(url, param) {
      let queryString = url.split("?");
      if (queryString.length < 2) {
        return "";
      }
      queryString = queryString[1]?.split("#") ?? [];
      const parts = queryString[0]?.split("&").reduce((a, s) => a.concat(s.split("=")), []) ?? [];
      if (parts.length < 2) {
        return "";
      }
      const paramIdx = parts.indexOf(param);
      return decodeURIComponent(paramIdx >= 0 ? parts[paramIdx + 1] ?? "" : "");
    }
    /**
     * Converts the keys and values of an object to a url query string
     */
    static objectToQueryString(dict) {
      return Object.entries(dict).map(([key, val]) => `${key}=${encodeURIComponent(val)}`).join("&");
    }
    /**
     * Generates a code_verifier and code_challenge, as specified in rfc7636.
     */
    static generatePKCECodes() {
      const output = new Uint32Array(RECOMMENDED_CODE_VERIFIER_LENGTH);
      crypto.getRandomValues(output);
      const codeVerifier = _OAuth2AuthCodePKCE.base64urlEncode(Array.from(output).map((num) => PKCE_CHARSET[num % PKCE_CHARSET.length]).join(""));
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier)).then((buffer) => {
        let hash = new Uint8Array(buffer);
        let binary = "";
        let hashLength = hash.byteLength;
        for (let i2 = 0; i2 < hashLength; i2++) {
          binary += String.fromCharCode(hash[i2] ?? 0);
        }
        return binary;
      }).then(_OAuth2AuthCodePKCE.base64urlEncode).then((codeChallenge) => ({ codeChallenge, codeVerifier }));
    }
    /**
     * Generates random state to be passed for anti-csrf.
     */
    static generateRandomState(lengthOfState) {
      const output = new Uint32Array(lengthOfState);
      crypto.getRandomValues(output);
      return Array.from(output).map((num) => PKCE_CHARSET[num % PKCE_CHARSET.length]).join("");
    }
  };

  // node_modules/@kittycad/lib/dist/mjs/index.js
  try {
    if ("undefined" == typeof fetch && "undefined" != typeof process && process.versions?.node) {
      new Function("m", "return import(m)")("cross-fetch/polyfill").catch((() => {
      }));
    }
  } catch {
  }
  var n = class {
    constructor(t) {
      const e = "undefined" != typeof process ? process.env : void 0, n2 = e?.KITTYCAD_TOKEN || e?.KITTYCAD_API_TOKEN || e?.ZOO_AI_TOKEN, i2 = e?.ZOO_HOST;
      "string" == typeof t ? this.token = t : t && "object" == typeof t && (this.token = t.token, this.baseUrl = t.baseUrl, this.fetch = t.fetch, this.clientId = t.clientId, this.redirectUrl = t.redirectUrl, this.scopes = t.scopes, this.onAccessTokenExpiry = t.onAccessTokenExpiry, this.onInvalidGrant = t.onInvalidGrant), this.token ??= n2, this.baseUrl ??= i2, this.clientId && "undefined" != typeof localStorage && (this.oauth2 = this.createOAuth2Client(), this.oauth2.isHTTPDecoratorActive(true), this.fetch = this.oauth2.decorateFetchHTTPClient(this.fetch || fetch));
    }
    authorize(t) {
      return this.oauth2.fetchAuthorizationCode(t);
    }
    isReturningFromAuthServer() {
      return this.oauth2.isReturningFromAuthServer();
    }
    async getAccessToken() {
      const t = await this.oauth2.getAccessToken();
      return this.updateTokenFromAccessContext(t), t;
    }
    resetOAuth2() {
      this.oauth2.reset(), this.token = void 0;
    }
    createOAuth2Client() {
      const e = this.baseUrl || "https://api.zoo.dev", n2 = this.redirectUrl || ("undefined" == typeof location ? void 0 : `${location.origin}${location.pathname}`);
      if (!n2) throw new Error("OAuth2 requires redirectUrl when the current browser URL is unavailable.");
      return new OAuth2AuthCodePKCE({ authorizationUrl: i(e, "/oauth2/authorize"), tokenUrl: i(e, "/oauth2/token"), clientId: this.clientId, redirectUrl: n2, scopes: this.scopes || [], onAccessTokenExpiry: async (t) => {
        const e2 = await (this.onAccessTokenExpiry ? this.onAccessTokenExpiry(t) : t());
        return this.updateTokenFromAccessContext(e2), e2;
      }, onInvalidGrant: this.onInvalidGrant || (() => {
      }) });
    }
    updateTokenFromAccessContext(t) {
      t?.token?.value && (this.token = t.token.value);
    }
  };
  function i(t, e) {
    return `${t.replace(/\/+$/, "")}/${e.replace(/^\/+/, "")}`;
  }
  function l(t) {
    const e = new URLSearchParams();
    for (const [n3, i2] of Object.entries(t)) if (void 0 !== i2) if (Array.isArray(i2)) for (const t2 of i2) e.append(n3, String(t2));
    else e.append(n3, String(i2));
    const n2 = e.toString();
    return n2 ? `?${n2}` : "";
  }
  try {
    if ("undefined" != typeof process && process.versions?.node && "win32" === process.platform) {
      new Function("m", "return import(m)")("win-ca");
    }
  } catch {
  }
  var r = (() => {
    const t = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag).get;
    return (e) => t.call(e);
  })();
  function h(t) {
    return "Uint8Array" === r(t);
  }
  function p(t) {
    return "object" == typeof t && null != t && Symbol.toStringTag in t && ("ArrayBuffer" === t[Symbol.toStringTag] || "SharedArrayBuffer" === t[Symbol.toStringTag]);
  }
  function y(t) {
    return t instanceof RegExp || "[object RegExp]" === Object.prototype.toString.call(t);
  }
  function X(t) {
    return "object" == typeof t && null != t && Symbol.toStringTag in t && "Map" === t[Symbol.toStringTag];
  }
  function G(t) {
    return t instanceof Date || "[object Date]" === Object.prototype.toString.call(t);
  }
  function V(t, e) {
    return JSON.stringify(t, ((t2, e2) => "bigint" == typeof e2 ? { $numberLong: `${e2}` } : X(e2) ? Object.fromEntries(e2) : e2));
  }
  var W = 7;
  var f = /* @__PURE__ */ Symbol.for("@@mdb.bson.version");
  var g = 2147483647;
  var Y = -2147483648;
  var I = Math.pow(2, 63) - 1;
  var R = -Math.pow(2, 63);
  var S = Math.pow(2, 53);
  var J = -Math.pow(2, 53);
  var K = 1;
  var T = 2;
  var L = 3;
  var x = 4;
  var U = 5;
  var z = 6;
  var N = 7;
  var w = 8;
  var k = 9;
  var H = 10;
  var B = 11;
  var C = 12;
  var v = 13;
  var j = 14;
  var M = 15;
  var P = 16;
  var F = 17;
  var Q = 18;
  var O = 19;
  var E = 255;
  var _ = 127;
  var D = 0;
  var A = 4;
  var $ = Object.freeze({ double: 1, string: 2, object: 3, array: 4, binData: 5, undefined: 6, objectId: 7, bool: 8, date: 9, null: 10, regex: 11, dbPointer: 12, javascript: 13, symbol: 14, javascriptWithScope: 15, int: 16, timestamp: 17, long: 18, decimal: 19, minKey: -1, maxKey: 127 });
  var q = class extends Error {
    get bsonError() {
      return true;
    }
    get name() {
      return "BSONError";
    }
    constructor(t, e) {
      super(t, e);
    }
    static isBSONError(t) {
      return null != t && "object" == typeof t && "bsonError" in t && true === t.bsonError && "name" in t && "message" in t && "stack" in t;
    }
  };
  var tt = class extends q {
    get name() {
      return "BSONVersionError";
    }
    constructor() {
      super(`Unsupported BSON version, bson types must be from bson ${W}.x.x`);
    }
  };
  var et = class extends q {
    get name() {
      return "BSONRuntimeError";
    }
    constructor(t) {
      super(t);
    }
  };
  var nt = class extends q {
    get name() {
      return "BSONOffsetError";
    }
    offset;
    constructor(t, e, n2) {
      super(`${t}. offset: ${e}`, n2), this.offset = e;
    }
  };
  var it;
  var lt;
  function ot(t, e, n2, i2) {
    if (i2) {
      it ??= new TextDecoder("utf8", { fatal: true });
      try {
        return it.decode(t.subarray(e, n2));
      } catch (t2) {
        throw new q("Invalid UTF-8 string in BSON document", { cause: t2 });
      }
    }
    return lt ??= new TextDecoder("utf8", { fatal: false }), lt.decode(t.subarray(e, n2));
  }
  function ct(t, e, n2) {
    if (0 === t.length) return "";
    const i2 = n2 - e;
    if (0 === i2) return "";
    if (i2 > 20) return null;
    if (1 === i2 && t[e] < 128) return String.fromCharCode(t[e]);
    if (2 === i2 && t[e] < 128 && t[e + 1] < 128) return String.fromCharCode(t[e]) + String.fromCharCode(t[e + 1]);
    if (3 === i2 && t[e] < 128 && t[e + 1] < 128 && t[e + 2] < 128) return String.fromCharCode(t[e]) + String.fromCharCode(t[e + 1]) + String.fromCharCode(t[e + 2]);
    const l2 = [];
    for (let i3 = e; i3 < n2; i3++) {
      const e2 = t[i3];
      if (e2 > 127) return null;
      l2.push(e2);
    }
    return String.fromCharCode(...l2);
  }
  function st(t) {
    return bt.fromNumberArray(Array.from({ length: t }, (() => Math.floor(256 * Math.random()))));
  }
  function at(t) {
    return crypto.getRandomValues(bt.allocate(t));
  }
  var dt = (() => {
    const { crypto: t } = globalThis;
    return null != t && "function" == typeof t.getRandomValues ? at : st;
  })();
  var bt = { isUint8Array: h, toLocalBufferType(t) {
    if (Buffer.isBuffer(t)) return t;
    if (ArrayBuffer.isView(t)) return Buffer.from(t.buffer, t.byteOffset, t.byteLength);
    const e = t?.[Symbol.toStringTag] ?? Object.prototype.toString.call(t);
    if ("ArrayBuffer" === e || "SharedArrayBuffer" === e || "[object ArrayBuffer]" === e || "[object SharedArrayBuffer]" === e) return Buffer.from(t);
    throw new q("Cannot create Buffer from the passed potentialBuffer.");
  }, allocate: (t) => Buffer.alloc(t), allocateUnsafe: (t) => Buffer.allocUnsafe(t), compare: (t, e) => bt.toLocalBufferType(t).compare(e), concat: (t) => Buffer.concat(t), copy: (t, e, n2, i2, l2) => bt.toLocalBufferType(t).copy(e, n2 ?? 0, i2 ?? 0, l2 ?? t.length), equals: (t, e) => bt.toLocalBufferType(t).equals(e), fromNumberArray: (t) => Buffer.from(t), fromBase64: (t) => Buffer.from(t, "base64"), fromUTF8: (t) => Buffer.from(t, "utf8"), toBase64: (t) => bt.toLocalBufferType(t).toString("base64"), fromISO88591: (t) => Buffer.from(t, "binary"), toISO88591: (t) => bt.toLocalBufferType(t).toString("binary"), fromHex: (t) => Buffer.from(t, "hex"), toHex: (t) => bt.toLocalBufferType(t).toString("hex"), toUTF8(t, e, n2, i2) {
    const l2 = n2 - e <= 20 ? ct(t, e, n2) : null;
    if (null != l2) return l2;
    const o = bt.toLocalBufferType(t).toString("utf8", e, n2);
    if (i2) {
      for (let i3 = 0; i3 < o.length; i3++) if (65533 === o.charCodeAt(i3)) {
        ot(t, e, n2, true);
        break;
      }
    }
    return o;
  }, utf8ByteLength: (t) => Buffer.byteLength(t, "utf8"), encodeUTF8Into(t, e, n2) {
    const i2 = (function(t2, e2, n3) {
      if (0 === e2.length) return 0;
      if (e2.length > 25) return null;
      if (t2.length - n3 < e2.length) return null;
      for (let i3 = 0, l2 = n3; i3 < e2.length; i3++, l2++) {
        const n4 = e2.charCodeAt(i3);
        if (n4 > 127) return null;
        t2[l2] = n4;
      }
      return e2.length;
    })(t, e, n2);
    return null != i2 ? i2 : bt.toLocalBufferType(t).write(e, n2, void 0, "utf8");
  }, randomBytes: dt, swap32: (t) => bt.toLocalBufferType(t).swap32() };
  function Zt(t) {
    if (t < 0) throw new RangeError(`The argument 'byteLength' is invalid. Received ${t}`);
    return rt.fromNumberArray(Array.from({ length: t }, (() => Math.floor(256 * Math.random()))));
  }
  var mt = (() => {
    const { crypto: t } = globalThis;
    if (null != t && "function" == typeof t.getRandomValues) return (e) => t.getRandomValues(rt.allocate(e));
    if ((function() {
      const { navigator: t2 } = globalThis;
      return "object" == typeof t2 && "ReactNative" === t2.product;
    })()) {
      const { console: t2 } = globalThis;
      t2?.warn?.("BSON: For React Native please polyfill crypto.getRandomValues, e.g. using: https://www.npmjs.com/package/react-native-get-random-values.");
    }
    return Zt;
  })();
  var ut = /(\d|[a-f])/i;
  var rt = { isUint8Array: h, toLocalBufferType(t) {
    const e = t?.[Symbol.toStringTag] ?? Object.prototype.toString.call(t);
    if ("Uint8Array" === e) return t;
    if (ArrayBuffer.isView(t)) return new Uint8Array(t.buffer.slice(t.byteOffset, t.byteOffset + t.byteLength));
    if ("ArrayBuffer" === e || "SharedArrayBuffer" === e || "[object ArrayBuffer]" === e || "[object SharedArrayBuffer]" === e) return new Uint8Array(t);
    throw new q("Cannot make a Uint8Array from passed potentialBuffer.");
  }, allocate(t) {
    if ("number" != typeof t) throw new TypeError(`The "size" argument must be of type number. Received ${String(t)}`);
    return new Uint8Array(t);
  }, allocateUnsafe: (t) => rt.allocate(t), compare(t, e) {
    if (t === e) return 0;
    const n2 = Math.min(t.length, e.length);
    for (let i2 = 0; i2 < n2; i2++) {
      if (t[i2] < e[i2]) return -1;
      if (t[i2] > e[i2]) return 1;
    }
    return t.length < e.length ? -1 : t.length > e.length ? 1 : 0;
  }, concat(t) {
    if (0 === t.length) return rt.allocate(0);
    let e = 0;
    for (const n3 of t) e += n3.length;
    const n2 = rt.allocate(e);
    let i2 = 0;
    for (const e2 of t) n2.set(e2, i2), i2 += e2.length;
    return n2;
  }, copy(t, e, n2, i2, l2) {
    if (void 0 !== l2 && l2 < 0) throw new RangeError(`The value of "sourceEnd" is out of range. It must be >= 0. Received ${l2}`);
    if (l2 = l2 ?? t.length, void 0 !== i2 && (i2 < 0 || i2 > l2)) throw new RangeError(`The value of "sourceStart" is out of range. It must be >= 0 and <= ${l2}. Received ${i2}`);
    if (i2 = i2 ?? 0, void 0 !== n2 && n2 < 0) throw new RangeError(`The value of "targetStart" is out of range. It must be >= 0. Received ${n2}`);
    n2 = n2 ?? 0;
    const o = t.subarray(i2, l2), c = Math.min(o.length, e.length - n2);
    return c <= 0 ? 0 : (e.set(o.subarray(0, c), n2), c);
  }, equals(t, e) {
    if (t.byteLength !== e.byteLength) return false;
    for (let n2 = 0; n2 < t.byteLength; n2++) if (t[n2] !== e[n2]) return false;
    return true;
  }, fromNumberArray: (t) => Uint8Array.from(t), fromBase64: (t) => Uint8Array.from(atob(t), ((t2) => t2.charCodeAt(0))), fromUTF8: (t) => new TextEncoder().encode(t), toBase64: (t) => btoa(rt.toISO88591(t)), fromISO88591: (t) => Uint8Array.from(t, ((t2) => 255 & t2.charCodeAt(0))), toISO88591: (t) => Array.from(Uint16Array.from(t), ((t2) => String.fromCharCode(t2))).join(""), fromHex(t) {
    const e = t.length % 2 == 0 ? t : t.slice(0, t.length - 1), n2 = [];
    for (let t2 = 0; t2 < e.length; t2 += 2) {
      const i2 = e[t2], l2 = e[t2 + 1];
      if (!ut.test(i2)) break;
      if (!ut.test(l2)) break;
      const o = Number.parseInt(`${i2}${l2}`, 16);
      n2.push(o);
    }
    return Uint8Array.from(n2);
  }, toHex: (t) => Array.from(t, ((t2) => t2.toString(16).padStart(2, "0"))).join(""), toUTF8(t, e, n2, i2) {
    const l2 = n2 - e <= 20 ? ct(t, e, n2) : null;
    return null != l2 ? l2 : ot(t, e, n2, i2);
  }, utf8ByteLength: (t) => new TextEncoder().encode(t).byteLength, encodeUTF8Into(t, e, n2) {
    const i2 = new TextEncoder().encode(e);
    return t.set(i2, n2), i2.byteLength;
  }, randomBytes: mt, swap32(t) {
    if (t.length % 4 != 0) throw new RangeError("Buffer size must be a multiple of 32-bits");
    for (let e = 0; e < t.length; e += 4) {
      const n2 = t[e], i2 = t[e + 1], l2 = t[e + 2], o = t[e + 3];
      t[e] = o, t[e + 1] = l2, t[e + 2] = i2, t[e + 3] = n2;
    }
    return t;
  } };
  var ht = "function" == typeof Buffer && true !== Buffer.prototype?._isBuffer ? bt : rt;
  var pt = /* @__PURE__ */ Symbol.for("@@mdb.bson.type");
  var yt = class {
    get [pt]() {
      return this._bsontype;
    }
    get [f]() {
      return W;
    }
    [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")](t, e, n2) {
      return this.inspect(t, e, n2);
    }
  };
  var Xt = new Float64Array(1);
  var Gt = new Uint8Array(Xt.buffer, 0, 8);
  Xt[0] = -1;
  var Vt = 0 === Gt[7];
  var Wt = { isBigEndian: Vt, getNonnegativeInt32LE(t, e) {
    if (t[e + 3] > 127) throw new RangeError(`Size cannot be negative at offset: ${e}`);
    return t[e] | t[e + 1] << 8 | t[e + 2] << 16 | t[e + 3] << 24;
  }, getInt32LE: (t, e) => t[e] | t[e + 1] << 8 | t[e + 2] << 16 | t[e + 3] << 24, getUint32LE: (t, e) => t[e] + 256 * t[e + 1] + 65536 * t[e + 2] + 16777216 * t[e + 3], getUint32BE: (t, e) => t[e + 3] + 256 * t[e + 2] + 65536 * t[e + 1] + 16777216 * t[e], getBigInt64LE: (t, e) => (BigInt(t[e + 4] + 256 * t[e + 5] + 65536 * t[e + 6] + (t[e + 7] << 24)) << 32n) + BigInt(t[e] + 256 * t[e + 1] + 65536 * t[e + 2] + 16777216 * t[e + 3]), getFloat64LE: Vt ? (t, e) => (Gt[7] = t[e], Gt[6] = t[e + 1], Gt[5] = t[e + 2], Gt[4] = t[e + 3], Gt[3] = t[e + 4], Gt[2] = t[e + 5], Gt[1] = t[e + 6], Gt[0] = t[e + 7], Xt[0]) : (t, e) => (Gt[0] = t[e], Gt[1] = t[e + 1], Gt[2] = t[e + 2], Gt[3] = t[e + 3], Gt[4] = t[e + 4], Gt[5] = t[e + 5], Gt[6] = t[e + 6], Gt[7] = t[e + 7], Xt[0]), setInt32BE: (t, e, n2) => (t[e + 3] = n2, n2 >>>= 8, t[e + 2] = n2, n2 >>>= 8, t[e + 1] = n2, n2 >>>= 8, t[e] = n2, 4), setInt32LE: (t, e, n2) => (t[e] = n2, n2 >>>= 8, t[e + 1] = n2, n2 >>>= 8, t[e + 2] = n2, n2 >>>= 8, t[e + 3] = n2, 4), setBigInt64LE(t, e, n2) {
    const i2 = 0xffffffffn;
    let l2 = Number(n2 & i2);
    t[e] = l2, l2 >>= 8, t[e + 1] = l2, l2 >>= 8, t[e + 2] = l2, l2 >>= 8, t[e + 3] = l2;
    let o = Number(n2 >> 32n & i2);
    return t[e + 4] = o, o >>= 8, t[e + 5] = o, o >>= 8, t[e + 6] = o, o >>= 8, t[e + 7] = o, 8;
  }, setFloat64LE: Vt ? (t, e, n2) => (Xt[0] = n2, t[e] = Gt[7], t[e + 1] = Gt[6], t[e + 2] = Gt[5], t[e + 3] = Gt[4], t[e + 4] = Gt[3], t[e + 5] = Gt[2], t[e + 6] = Gt[1], t[e + 7] = Gt[0], 8) : (t, e, n2) => (Xt[0] = n2, t[e] = Gt[0], t[e + 1] = Gt[1], t[e + 2] = Gt[2], t[e + 3] = Gt[3], t[e + 4] = Gt[4], t[e + 5] = Gt[5], t[e + 6] = Gt[6], t[e + 7] = Gt[7], 8) };
  var ft = class _ft extends yt {
    get _bsontype() {
      return "Binary";
    }
    static BSON_BINARY_SUBTYPE_DEFAULT = 0;
    static BUFFER_SIZE = 256;
    static SUBTYPE_DEFAULT = 0;
    static SUBTYPE_FUNCTION = 1;
    static SUBTYPE_BYTE_ARRAY = 2;
    static SUBTYPE_UUID_OLD = 3;
    static SUBTYPE_UUID = 4;
    static SUBTYPE_MD5 = 5;
    static SUBTYPE_ENCRYPTED = 6;
    static SUBTYPE_COLUMN = 7;
    static SUBTYPE_SENSITIVE = 8;
    static SUBTYPE_VECTOR = 9;
    static SUBTYPE_USER_DEFINED = 128;
    static VECTOR_TYPE = Object.freeze({ Int8: 3, Float32: 39, PackedBit: 16 });
    buffer;
    sub_type;
    position;
    constructor(t, e) {
      if (super(), null != t && "string" == typeof t && !ArrayBuffer.isView(t) && !p(t) && !Array.isArray(t)) throw new q("Binary can only be constructed from Uint8Array or number[]");
      this.sub_type = e ?? _ft.BSON_BINARY_SUBTYPE_DEFAULT, null == t ? (this.buffer = ht.allocate(_ft.BUFFER_SIZE), this.position = 0) : (this.buffer = Array.isArray(t) ? ht.fromNumberArray(t) : ht.toLocalBufferType(t), this.position = this.buffer.byteLength);
    }
    put(t) {
      if ("string" == typeof t && 1 !== t.length) throw new q("only accepts single character String");
      if ("number" != typeof t && 1 !== t.length) throw new q("only accepts single character Uint8Array or Array");
      let e;
      if (e = "string" == typeof t ? t.charCodeAt(0) : "number" == typeof t ? t : t[0], e < 0 || e > 255) throw new q("only accepts number in a valid unsigned byte range 0-255");
      if (this.buffer.byteLength > this.position) this.buffer[this.position++] = e;
      else {
        const t2 = ht.allocate(_ft.BUFFER_SIZE + this.buffer.length);
        t2.set(this.buffer, 0), this.buffer = t2, this.buffer[this.position++] = e;
      }
    }
    write(t, e) {
      if (e = "number" == typeof e ? e : this.position, this.buffer.byteLength < e + t.length) {
        const e2 = ht.allocate(this.buffer.byteLength + t.length);
        e2.set(this.buffer, 0), this.buffer = e2;
      }
      if (ArrayBuffer.isView(t)) this.buffer.set(ht.toLocalBufferType(t), e), this.position = e + t.byteLength > this.position ? e + t.length : this.position;
      else if ("string" == typeof t) throw new q("input cannot be string");
    }
    read(t, e) {
      const n2 = t + (e = e && e > 0 ? e : this.position);
      return this.buffer.subarray(t, n2 > this.position ? this.position : n2);
    }
    value() {
      return this.buffer.length === this.position ? this.buffer : this.buffer.subarray(0, this.position);
    }
    length() {
      return this.position;
    }
    toJSON() {
      return ht.toBase64(this.buffer.subarray(0, this.position));
    }
    toString(t) {
      return "hex" === t ? ht.toHex(this.buffer.subarray(0, this.position)) : "base64" === t ? ht.toBase64(this.buffer.subarray(0, this.position)) : ht.toUTF8(this.buffer, 0, this.position, false);
    }
    toExtendedJSON(t) {
      t = t || {}, this.sub_type === _ft.SUBTYPE_VECTOR && gt(this);
      const e = ht.toBase64(this.buffer), n2 = Number(this.sub_type).toString(16);
      return t.legacy ? { $binary: e, $type: 1 === n2.length ? "0" + n2 : n2 } : { $binary: { base64: e, subType: 1 === n2.length ? "0" + n2 : n2 } };
    }
    toUUID() {
      if (this.sub_type === _ft.SUBTYPE_UUID) return new Rt(this.buffer.subarray(0, this.position));
      throw new q(`Binary sub_type "${this.sub_type}" is not supported for converting to UUID. Only "${_ft.SUBTYPE_UUID}" is currently supported.`);
    }
    static createFromHexString(t, e) {
      return new _ft(ht.fromHex(t), e);
    }
    static createFromBase64(t, e) {
      return new _ft(ht.fromBase64(t), e);
    }
    static fromExtendedJSON(t, e) {
      let n2, i2;
      if (e = e || {}, "$binary" in t ? e.legacy && "string" == typeof t.$binary && "$type" in t ? (i2 = t.$type ? parseInt(t.$type, 16) : 0, n2 = ht.fromBase64(t.$binary)) : "string" != typeof t.$binary && (i2 = t.$binary.subType ? parseInt(t.$binary.subType, 16) : 0, n2 = ht.fromBase64(t.$binary.base64)) : "$uuid" in t && (i2 = 4, n2 = Rt.bytesFromString(t.$uuid)), !n2) throw new q(`Unexpected Binary Extended JSON format ${JSON.stringify(t)}`);
      return i2 === A ? new Rt(n2) : new _ft(n2, i2);
    }
    inspect(t, e, n2) {
      n2 ??= V;
      return `Binary.createFromBase64(${n2(ht.toBase64(this.buffer.subarray(0, this.position)), e)}, ${n2(this.sub_type, e)})`;
    }
    toInt8Array() {
      if (this.sub_type !== _ft.SUBTYPE_VECTOR) throw new q("Binary sub_type is not Vector");
      if (this.buffer[0] !== _ft.VECTOR_TYPE.Int8) throw new q("Binary datatype field is not Int8");
      return gt(this), new Int8Array(this.buffer.buffer.slice(this.buffer.byteOffset + 2, this.buffer.byteOffset + this.position));
    }
    toFloat32Array() {
      if (this.sub_type !== _ft.SUBTYPE_VECTOR) throw new q("Binary sub_type is not Vector");
      if (this.buffer[0] !== _ft.VECTOR_TYPE.Float32) throw new q("Binary datatype field is not Float32");
      gt(this);
      const t = new Uint8Array(this.buffer.buffer.slice(this.buffer.byteOffset + 2, this.buffer.byteOffset + this.position));
      return Wt.isBigEndian && ht.swap32(t), new Float32Array(t.buffer);
    }
    toPackedBits() {
      if (this.sub_type !== _ft.SUBTYPE_VECTOR) throw new q("Binary sub_type is not Vector");
      if (this.buffer[0] !== _ft.VECTOR_TYPE.PackedBit) throw new q("Binary datatype field is not packed bit");
      return gt(this), new Uint8Array(this.buffer.buffer.slice(this.buffer.byteOffset + 2, this.buffer.byteOffset + this.position));
    }
    toBits() {
      if (this.sub_type !== _ft.SUBTYPE_VECTOR) throw new q("Binary sub_type is not Vector");
      if (this.buffer[0] !== _ft.VECTOR_TYPE.PackedBit) throw new q("Binary datatype field is not packed bit");
      gt(this);
      const t = 8 * (this.length() - 2) - this.buffer[1], e = new Int8Array(t);
      for (let t2 = 0; t2 < e.length; t2++) {
        const n2 = t2 / 8 | 0, i2 = this.buffer[n2 + 2] >> 7 - t2 % 8 & 1;
        e[t2] = i2;
      }
      return e;
    }
    static fromInt8Array(t) {
      const e = ht.allocate(t.byteLength + 2);
      e[0] = _ft.VECTOR_TYPE.Int8, e[1] = 0;
      const n2 = new Uint8Array(t.buffer, t.byteOffset, t.byteLength);
      e.set(n2, 2);
      const i2 = new this(e, this.SUBTYPE_VECTOR);
      return gt(i2), i2;
    }
    static fromFloat32Array(t) {
      const e = ht.allocate(t.byteLength + 2);
      e[0] = _ft.VECTOR_TYPE.Float32, e[1] = 0;
      const n2 = new Uint8Array(t.buffer, t.byteOffset, t.byteLength);
      e.set(n2, 2), Wt.isBigEndian && ht.swap32(new Uint8Array(e.buffer, 2));
      const i2 = new this(e, this.SUBTYPE_VECTOR);
      return gt(i2), i2;
    }
    static fromPackedBits(t, e = 0) {
      const n2 = ht.allocate(t.byteLength + 2);
      n2[0] = _ft.VECTOR_TYPE.PackedBit, n2[1] = e, n2.set(t, 2);
      const i2 = new this(n2, this.SUBTYPE_VECTOR);
      return gt(i2), i2;
    }
    static fromBits(t) {
      const e = t.length + 7 >>> 3, n2 = new Uint8Array(e + 2);
      n2[0] = _ft.VECTOR_TYPE.PackedBit;
      const i2 = t.length % 8;
      n2[1] = 0 === i2 ? 0 : 8 - i2;
      for (let e2 = 0; e2 < t.length; e2++) {
        const i3 = e2 >>> 3, l2 = t[e2];
        if (0 !== l2 && 1 !== l2) throw new q(`Invalid bit value at ${e2}: must be 0 or 1, found ${t[e2]}`);
        if (0 === l2) continue;
        const o = 7 - e2 % 8;
        n2[i3 + 2] |= l2 << o;
      }
      return new this(n2, _ft.SUBTYPE_VECTOR);
    }
  };
  function gt(t) {
    if (t.sub_type !== ft.SUBTYPE_VECTOR) return;
    const e = t.position, n2 = t.buffer[0], i2 = t.buffer[1];
    if ((n2 === ft.VECTOR_TYPE.Float32 || n2 === ft.VECTOR_TYPE.Int8) && 0 !== i2) throw new q("Invalid Vector: padding must be zero for int8 and float32 vectors");
    if (n2 === ft.VECTOR_TYPE.Float32 && 0 !== e && e - 2 != 0 && (e - 2) % 4 != 0) throw new q("Invalid Vector: Float32 vector must contain a multiple of 4 bytes");
    if (n2 === ft.VECTOR_TYPE.PackedBit && 0 !== i2 && 2 === e) throw new q("Invalid Vector: padding must be zero for packed bit vectors that are empty");
    if (n2 === ft.VECTOR_TYPE.PackedBit && i2 > 7) throw new q(`Invalid Vector: padding must be a value between 0 and 7. found: ${i2}`);
  }
  var Yt = /^[0-9A-F]{32}$/i;
  var It = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
  var Rt = class _Rt extends ft {
    constructor(t) {
      let e;
      if (null == t) e = _Rt.generate();
      else if (t instanceof _Rt) e = ht.toLocalBufferType(new Uint8Array(t.buffer));
      else if (ArrayBuffer.isView(t) && 16 === t.byteLength) e = ht.toLocalBufferType(t);
      else {
        if ("string" != typeof t) throw new q("Argument passed in UUID constructor must be a UUID, a 16 byte Buffer or a 32/36 character hex string (dashes excluded/included, format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).");
        e = _Rt.bytesFromString(t);
      }
      super(e, A);
    }
    get id() {
      return this.buffer;
    }
    set id(t) {
      this.buffer = t;
    }
    toHexString(t = true) {
      return t ? [ht.toHex(this.buffer.subarray(0, 4)), ht.toHex(this.buffer.subarray(4, 6)), ht.toHex(this.buffer.subarray(6, 8)), ht.toHex(this.buffer.subarray(8, 10)), ht.toHex(this.buffer.subarray(10, 16))].join("-") : ht.toHex(this.buffer);
    }
    toString(t) {
      return "hex" === t ? ht.toHex(this.id) : "base64" === t ? ht.toBase64(this.id) : this.toHexString();
    }
    toJSON() {
      return this.toHexString();
    }
    equals(t) {
      if (!t) return false;
      if (t instanceof _Rt) return ht.equals(t.id, this.id);
      try {
        return ht.equals(new _Rt(t).id, this.id);
      } catch {
        return false;
      }
    }
    toBinary() {
      return new ft(this.id, ft.SUBTYPE_UUID);
    }
    static generate() {
      const t = ht.randomBytes(16);
      return t[6] = 15 & t[6] | 64, t[8] = 63 & t[8] | 128, t;
    }
    static isValid(t) {
      return !!t && ("string" == typeof t ? _Rt.isValidUUIDString(t) : h(t) ? 16 === t.byteLength : "Binary" === t._bsontype && t.sub_type === this.SUBTYPE_UUID && 16 === t.buffer.byteLength);
    }
    static createFromHexString(t) {
      const e = _Rt.bytesFromString(t);
      return new _Rt(e);
    }
    static createFromBase64(t) {
      return new _Rt(ht.fromBase64(t));
    }
    static bytesFromString(t) {
      if (!_Rt.isValidUUIDString(t)) throw new q("UUID string representation must be 32 hex digits or canonical hyphenated representation");
      return ht.fromHex(t.replace(/-/g, ""));
    }
    static isValidUUIDString(t) {
      return Yt.test(t) || It.test(t);
    }
    inspect(t, e, n2) {
      return n2 ??= V, `new UUID(${n2(this.toHexString(), e)})`;
    }
  };
  var St = class _St extends yt {
    get _bsontype() {
      return "Code";
    }
    code;
    scope;
    constructor(t, e) {
      super(), this.code = t.toString(), this.scope = e ?? null;
    }
    toJSON() {
      return null != this.scope ? { code: this.code, scope: this.scope } : { code: this.code };
    }
    toExtendedJSON() {
      return this.scope ? { $code: this.code, $scope: this.scope } : { $code: this.code };
    }
    static fromExtendedJSON(t) {
      return new _St(t.$code, t.$scope);
    }
    inspect(t, e, n2) {
      n2 ??= V;
      let i2 = n2(this.code, e);
      const l2 = i2.includes("\n");
      null != this.scope && (i2 += `,${l2 ? "\n" : " "}${n2(this.scope, e)}`);
      return `new Code(${l2 ? "\n" : ""}${i2}${l2 && null === this.scope ? "\n" : ""})`;
    }
  };
  function Jt(t) {
    return null != t && "object" == typeof t && "$id" in t && null != t.$id && "$ref" in t && "string" == typeof t.$ref && (!("$db" in t) || "$db" in t && "string" == typeof t.$db);
  }
  var Kt = class _Kt extends yt {
    get _bsontype() {
      return "DBRef";
    }
    collection;
    oid;
    db;
    fields;
    constructor(t, e, n2, i2) {
      super();
      const l2 = t.split(".");
      2 === l2.length && (n2 = l2.shift(), t = l2.shift()), this.collection = t, this.oid = e, this.db = n2, this.fields = i2 || {};
    }
    get namespace() {
      return this.collection;
    }
    set namespace(t) {
      this.collection = t;
    }
    toJSON() {
      const t = Object.assign({ $ref: this.collection, $id: this.oid }, this.fields);
      return null != this.db && (t.$db = this.db), t;
    }
    toExtendedJSON(t) {
      t = t || {};
      let e = { $ref: this.collection, $id: this.oid };
      return t.legacy || (this.db && (e.$db = this.db), e = Object.assign(e, this.fields)), e;
    }
    static fromExtendedJSON(t) {
      const e = Object.assign({}, t);
      return delete e.$ref, delete e.$id, delete e.$db, new _Kt(t.$ref, t.$id, t.$db, e);
    }
    inspect(t, e, n2) {
      n2 ??= V;
      const i2 = [n2(this.namespace, e), n2(this.oid, e), ...this.db ? [n2(this.db, e)] : [], ...Object.keys(this.fields).length > 0 ? [n2(this.fields, e)] : []];
      return i2[1] = n2 === V ? `new ObjectId(${i2[1]})` : i2[1], `new DBRef(${i2.join(", ")})`;
    }
  };
  function Tt(t) {
    if ("" === t) return t;
    let e = 0;
    const n2 = "-" === t[e], i2 = "+" === t[e];
    (i2 || n2) && (e += 1);
    let l2 = false;
    for (; e < t.length && "0" === t[e]; ++e) l2 = true;
    return l2 ? `${n2 ? "-" : ""}${t.length === e ? "0" : t.slice(e)}` : i2 ? t.slice(1) : t;
  }
  var Lt;
  try {
    Lt = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 13, 2, 96, 0, 1, 127, 96, 4, 127, 127, 127, 127, 1, 127, 3, 7, 6, 0, 1, 1, 1, 1, 1, 6, 6, 1, 127, 1, 65, 0, 11, 7, 50, 6, 3, 109, 117, 108, 0, 1, 5, 100, 105, 118, 95, 115, 0, 2, 5, 100, 105, 118, 95, 117, 0, 3, 5, 114, 101, 109, 95, 115, 0, 4, 5, 114, 101, 109, 95, 117, 0, 5, 8, 103, 101, 116, 95, 104, 105, 103, 104, 0, 0, 10, 191, 1, 6, 4, 0, 35, 0, 11, 36, 1, 1, 126, 32, 0, 173, 32, 1, 173, 66, 32, 134, 132, 32, 2, 173, 32, 3, 173, 66, 32, 134, 132, 126, 34, 4, 66, 32, 135, 167, 36, 0, 32, 4, 167, 11, 36, 1, 1, 126, 32, 0, 173, 32, 1, 173, 66, 32, 134, 132, 32, 2, 173, 32, 3, 173, 66, 32, 134, 132, 127, 34, 4, 66, 32, 135, 167, 36, 0, 32, 4, 167, 11, 36, 1, 1, 126, 32, 0, 173, 32, 1, 173, 66, 32, 134, 132, 32, 2, 173, 32, 3, 173, 66, 32, 134, 132, 128, 34, 4, 66, 32, 135, 167, 36, 0, 32, 4, 167, 11, 36, 1, 1, 126, 32, 0, 173, 32, 1, 173, 66, 32, 134, 132, 32, 2, 173, 32, 3, 173, 66, 32, 134, 132, 129, 34, 4, 66, 32, 135, 167, 36, 0, 32, 4, 167, 11, 36, 1, 1, 126, 32, 0, 173, 32, 1, 173, 66, 32, 134, 132, 32, 2, 173, 32, 3, 173, 66, 32, 134, 132, 130, 34, 4, 66, 32, 135, 167, 36, 0, 32, 4, 167, 11])), {}).exports;
  } catch {
  }
  var xt = 4294967296;
  var Ut = 18446744073709552e3;
  var zt = Ut / 2;
  var Nt = {};
  var wt = {};
  var kt = /^(\+?0|(\+|-)?[1-9][0-9]*)$/;
  var Ht = class _Ht extends yt {
    get _bsontype() {
      return "Long";
    }
    get __isLong__() {
      return true;
    }
    high;
    low;
    unsigned;
    constructor(t = 0, e, n2) {
      super();
      const i2 = "boolean" == typeof e ? e : Boolean(n2), l2 = "number" == typeof e ? e : 0, o = "string" == typeof t ? _Ht.fromString(t, i2) : "bigint" == typeof t ? _Ht.fromBigInt(t, i2) : { low: 0 | t, high: 0 | l2, unsigned: i2 };
      this.low = o.low, this.high = o.high, this.unsigned = o.unsigned;
    }
    static TWO_PWR_24 = _Ht.fromInt(16777216);
    static MAX_UNSIGNED_VALUE = _Ht.fromBits(-1, -1, true);
    static ZERO = _Ht.fromInt(0);
    static UZERO = _Ht.fromInt(0, true);
    static ONE = _Ht.fromInt(1);
    static UONE = _Ht.fromInt(1, true);
    static NEG_ONE = _Ht.fromInt(-1);
    static MAX_VALUE = _Ht.fromBits(-1, 2147483647, false);
    static MIN_VALUE = _Ht.fromBits(0, -2147483648, false);
    static fromBits(t, e, n2) {
      return new _Ht(t, e, n2);
    }
    static fromInt(t, e) {
      let n2, i2, l2;
      return e ? (l2 = 0 <= (t >>>= 0) && t < 256) && (i2 = wt[t], i2) ? i2 : (n2 = _Ht.fromBits(t, (0 | t) < 0 ? -1 : 0, true), l2 && (wt[t] = n2), n2) : (l2 = -128 <= (t |= 0) && t < 128) && (i2 = Nt[t], i2) ? i2 : (n2 = _Ht.fromBits(t, t < 0 ? -1 : 0, false), l2 && (Nt[t] = n2), n2);
    }
    static fromNumber(t, e) {
      if (isNaN(t)) return e ? _Ht.UZERO : _Ht.ZERO;
      if (e) {
        if (t < 0) return _Ht.UZERO;
        if (t >= Ut) return _Ht.MAX_UNSIGNED_VALUE;
      } else {
        if (t <= -zt) return _Ht.MIN_VALUE;
        if (t + 1 >= zt) return _Ht.MAX_VALUE;
      }
      return t < 0 ? _Ht.fromNumber(-t, e).neg() : _Ht.fromBits(t % xt | 0, t / xt | 0, e);
    }
    static fromBigInt(t, e) {
      const n2 = 0xffffffffn;
      return new _Ht(Number(t & n2), Number(t >> 32n & n2), e);
    }
    static _fromString(t, e, n2) {
      if (0 === t.length) throw new q("empty string");
      if (n2 < 2 || 36 < n2) throw new q("radix");
      let i2;
      if ((i2 = t.indexOf("-")) > 0) throw new q("interior hyphen");
      if (0 === i2) return _Ht._fromString(t.substring(1), e, n2).neg();
      const l2 = _Ht.fromNumber(Math.pow(n2, 8));
      let o = _Ht.ZERO;
      for (let e2 = 0; e2 < t.length; e2 += 8) {
        const i3 = Math.min(8, t.length - e2), c = parseInt(t.substring(e2, e2 + i3), n2);
        if (i3 < 8) {
          const t2 = _Ht.fromNumber(Math.pow(n2, i3));
          o = o.mul(t2).add(_Ht.fromNumber(c));
        } else o = o.mul(l2), o = o.add(_Ht.fromNumber(c));
      }
      return o.unsigned = e, o;
    }
    static fromStringStrict(t, e, n2) {
      let i2 = false;
      if ("number" == typeof e ? (n2 = e, e = false) : i2 = !!e, n2 ??= 10, t.trim() !== t) throw new q(`Input: '${t}' contains leading and/or trailing whitespace`);
      if (!(function(t2, e2) {
        const n3 = "0123456789abcdefghijklmnopqrstuvwxyz".slice(0, e2 = e2 ?? 10);
        return !new RegExp(`[^-+${n3}]`, "i").test(t2) && t2;
      })(t, n2)) throw new q(`Input: '${t}' contains invalid characters for radix: ${n2}`);
      const l2 = Tt(t), o = _Ht._fromString(l2, i2, n2);
      if (o.toString(n2).toLowerCase() !== l2.toLowerCase()) throw new q(`Input: ${t} is not representable as ${o.unsigned ? "an unsigned" : "a signed"} 64-bit Long ${null != n2 ? `with radix: ${n2}` : ""}`);
      return o;
    }
    static fromString(t, e, n2) {
      let i2 = false;
      return "number" == typeof e ? (n2 = e, e = false) : i2 = !!e, n2 ??= 10, "NaN" === t && n2 < 24 || ("Infinity" === t || "+Infinity" === t || "-Infinity" === t) && n2 < 35 ? _Ht.ZERO : _Ht._fromString(t, i2, n2);
    }
    static fromBytes(t, e, n2) {
      return n2 ? _Ht.fromBytesLE(t, e) : _Ht.fromBytesBE(t, e);
    }
    static fromBytesLE(t, e) {
      return new _Ht(t[0] | t[1] << 8 | t[2] << 16 | t[3] << 24, t[4] | t[5] << 8 | t[6] << 16 | t[7] << 24, e);
    }
    static fromBytesBE(t, e) {
      return new _Ht(t[4] << 24 | t[5] << 16 | t[6] << 8 | t[7], t[0] << 24 | t[1] << 16 | t[2] << 8 | t[3], e);
    }
    static isLong(t) {
      return null != t && "object" == typeof t && "__isLong__" in t && true === t.__isLong__;
    }
    static fromValue(t, e) {
      return "number" == typeof t ? _Ht.fromNumber(t, e) : "string" == typeof t ? _Ht.fromString(t, e) : _Ht.fromBits(t.low, t.high, "boolean" == typeof e ? e : t.unsigned);
    }
    add(t) {
      _Ht.isLong(t) || (t = _Ht.fromValue(t));
      const e = this.high >>> 16, n2 = 65535 & this.high, i2 = this.low >>> 16, l2 = 65535 & this.low, o = t.high >>> 16, c = 65535 & t.high, s = t.low >>> 16;
      let a = 0, d = 0, b = 0, Z = 0;
      return Z += l2 + (65535 & t.low), b += Z >>> 16, Z &= 65535, b += i2 + s, d += b >>> 16, b &= 65535, d += n2 + c, a += d >>> 16, d &= 65535, a += e + o, a &= 65535, _Ht.fromBits(b << 16 | Z, a << 16 | d, this.unsigned);
    }
    and(t) {
      return _Ht.isLong(t) || (t = _Ht.fromValue(t)), _Ht.fromBits(this.low & t.low, this.high & t.high, this.unsigned);
    }
    compare(t) {
      if (_Ht.isLong(t) || (t = _Ht.fromValue(t)), this.eq(t)) return 0;
      const e = this.isNegative(), n2 = t.isNegative();
      return e && !n2 ? -1 : !e && n2 ? 1 : this.unsigned ? t.high >>> 0 > this.high >>> 0 || t.high === this.high && t.low >>> 0 > this.low >>> 0 ? -1 : 1 : this.sub(t).isNegative() ? -1 : 1;
    }
    comp(t) {
      return this.compare(t);
    }
    divide(t) {
      if (_Ht.isLong(t) || (t = _Ht.fromValue(t)), t.isZero()) throw new q("division by zero");
      if (Lt) {
        if (!this.unsigned && -2147483648 === this.high && -1 === t.low && -1 === t.high) return this;
        const e2 = (this.unsigned ? Lt.div_u : Lt.div_s)(this.low, this.high, t.low, t.high);
        return _Ht.fromBits(e2, Lt.get_high(), this.unsigned);
      }
      if (this.isZero()) return this.unsigned ? _Ht.UZERO : _Ht.ZERO;
      let e, n2, i2;
      if (this.unsigned) {
        if (t.unsigned || (t = t.toUnsigned()), t.gt(this)) return _Ht.UZERO;
        if (t.gt(this.shru(1))) return _Ht.UONE;
        i2 = _Ht.UZERO;
      } else {
        if (this.eq(_Ht.MIN_VALUE)) {
          if (t.eq(_Ht.ONE) || t.eq(_Ht.NEG_ONE)) return _Ht.MIN_VALUE;
          if (t.eq(_Ht.MIN_VALUE)) return _Ht.ONE;
          return e = this.shr(1).div(t).shl(1), e.eq(_Ht.ZERO) ? t.isNegative() ? _Ht.ONE : _Ht.NEG_ONE : (n2 = this.sub(t.mul(e)), i2 = e.add(n2.div(t)), i2);
        }
        if (t.eq(_Ht.MIN_VALUE)) return this.unsigned ? _Ht.UZERO : _Ht.ZERO;
        if (this.isNegative()) return t.isNegative() ? this.neg().div(t.neg()) : this.neg().div(t).neg();
        if (t.isNegative()) return this.div(t.neg()).neg();
        i2 = _Ht.ZERO;
      }
      for (n2 = this; n2.gte(t); ) {
        e = Math.max(1, Math.floor(n2.toNumber() / t.toNumber()));
        const l2 = Math.ceil(Math.log(e) / Math.LN2), o = l2 <= 48 ? 1 : Math.pow(2, l2 - 48);
        let c = _Ht.fromNumber(e), s = c.mul(t);
        for (; s.isNegative() || s.gt(n2); ) e -= o, c = _Ht.fromNumber(e, this.unsigned), s = c.mul(t);
        c.isZero() && (c = _Ht.ONE), i2 = i2.add(c), n2 = n2.sub(s);
      }
      return i2;
    }
    div(t) {
      return this.divide(t);
    }
    equals(t) {
      return _Ht.isLong(t) || (t = _Ht.fromValue(t)), (this.unsigned === t.unsigned || this.high >>> 31 != 1 || t.high >>> 31 != 1) && (this.high === t.high && this.low === t.low);
    }
    eq(t) {
      return this.equals(t);
    }
    getHighBits() {
      return this.high;
    }
    getHighBitsUnsigned() {
      return this.high >>> 0;
    }
    getLowBits() {
      return this.low;
    }
    getLowBitsUnsigned() {
      return this.low >>> 0;
    }
    getNumBitsAbs() {
      if (this.isNegative()) return this.eq(_Ht.MIN_VALUE) ? 64 : this.neg().getNumBitsAbs();
      const t = 0 !== this.high ? this.high : this.low;
      let e;
      for (e = 31; e > 0 && !(t & 1 << e); e--) ;
      return 0 !== this.high ? e + 33 : e + 1;
    }
    greaterThan(t) {
      return this.comp(t) > 0;
    }
    gt(t) {
      return this.greaterThan(t);
    }
    greaterThanOrEqual(t) {
      return this.comp(t) >= 0;
    }
    gte(t) {
      return this.greaterThanOrEqual(t);
    }
    ge(t) {
      return this.greaterThanOrEqual(t);
    }
    isEven() {
      return !(1 & this.low);
    }
    isNegative() {
      return !this.unsigned && this.high < 0;
    }
    isOdd() {
      return !(1 & ~this.low);
    }
    isPositive() {
      return this.unsigned || this.high >= 0;
    }
    isZero() {
      return 0 === this.high && 0 === this.low;
    }
    lessThan(t) {
      return this.comp(t) < 0;
    }
    lt(t) {
      return this.lessThan(t);
    }
    lessThanOrEqual(t) {
      return this.comp(t) <= 0;
    }
    lte(t) {
      return this.lessThanOrEqual(t);
    }
    modulo(t) {
      if (_Ht.isLong(t) || (t = _Ht.fromValue(t)), Lt) {
        const e = (this.unsigned ? Lt.rem_u : Lt.rem_s)(this.low, this.high, t.low, t.high);
        return _Ht.fromBits(e, Lt.get_high(), this.unsigned);
      }
      return this.sub(this.div(t).mul(t));
    }
    mod(t) {
      return this.modulo(t);
    }
    rem(t) {
      return this.modulo(t);
    }
    multiply(t) {
      if (this.isZero()) return _Ht.ZERO;
      if (_Ht.isLong(t) || (t = _Ht.fromValue(t)), Lt) {
        const e2 = Lt.mul(this.low, this.high, t.low, t.high);
        return _Ht.fromBits(e2, Lt.get_high(), this.unsigned);
      }
      if (t.isZero()) return _Ht.ZERO;
      if (this.eq(_Ht.MIN_VALUE)) return t.isOdd() ? _Ht.MIN_VALUE : _Ht.ZERO;
      if (t.eq(_Ht.MIN_VALUE)) return this.isOdd() ? _Ht.MIN_VALUE : _Ht.ZERO;
      if (this.isNegative()) return t.isNegative() ? this.neg().mul(t.neg()) : this.neg().mul(t).neg();
      if (t.isNegative()) return this.mul(t.neg()).neg();
      if (this.lt(_Ht.TWO_PWR_24) && t.lt(_Ht.TWO_PWR_24)) return _Ht.fromNumber(this.toNumber() * t.toNumber(), this.unsigned);
      const e = this.high >>> 16, n2 = 65535 & this.high, i2 = this.low >>> 16, l2 = 65535 & this.low, o = t.high >>> 16, c = 65535 & t.high, s = t.low >>> 16, a = 65535 & t.low;
      let d = 0, b = 0, Z = 0, m = 0;
      return m += l2 * a, Z += m >>> 16, m &= 65535, Z += i2 * a, b += Z >>> 16, Z &= 65535, Z += l2 * s, b += Z >>> 16, Z &= 65535, b += n2 * a, d += b >>> 16, b &= 65535, b += i2 * s, d += b >>> 16, b &= 65535, b += l2 * c, d += b >>> 16, b &= 65535, d += e * a + n2 * s + i2 * c + l2 * o, d &= 65535, _Ht.fromBits(Z << 16 | m, d << 16 | b, this.unsigned);
    }
    mul(t) {
      return this.multiply(t);
    }
    negate() {
      return !this.unsigned && this.eq(_Ht.MIN_VALUE) ? _Ht.MIN_VALUE : this.not().add(_Ht.ONE);
    }
    neg() {
      return this.negate();
    }
    not() {
      return _Ht.fromBits(~this.low, ~this.high, this.unsigned);
    }
    notEquals(t) {
      return !this.equals(t);
    }
    neq(t) {
      return this.notEquals(t);
    }
    ne(t) {
      return this.notEquals(t);
    }
    or(t) {
      return _Ht.isLong(t) || (t = _Ht.fromValue(t)), _Ht.fromBits(this.low | t.low, this.high | t.high, this.unsigned);
    }
    shiftLeft(t) {
      return _Ht.isLong(t) && (t = t.toInt()), 0 == (t &= 63) ? this : t < 32 ? _Ht.fromBits(this.low << t, this.high << t | this.low >>> 32 - t, this.unsigned) : _Ht.fromBits(0, this.low << t - 32, this.unsigned);
    }
    shl(t) {
      return this.shiftLeft(t);
    }
    shiftRight(t) {
      return _Ht.isLong(t) && (t = t.toInt()), 0 == (t &= 63) ? this : t < 32 ? _Ht.fromBits(this.low >>> t | this.high << 32 - t, this.high >> t, this.unsigned) : _Ht.fromBits(this.high >> t - 32, this.high >= 0 ? 0 : -1, this.unsigned);
    }
    shr(t) {
      return this.shiftRight(t);
    }
    shiftRightUnsigned(t) {
      if (_Ht.isLong(t) && (t = t.toInt()), 0 === (t &= 63)) return this;
      {
        const e = this.high;
        if (t < 32) {
          const n2 = this.low;
          return _Ht.fromBits(n2 >>> t | e << 32 - t, e >>> t, this.unsigned);
        }
        return 32 === t ? _Ht.fromBits(e, 0, this.unsigned) : _Ht.fromBits(e >>> t - 32, 0, this.unsigned);
      }
    }
    shr_u(t) {
      return this.shiftRightUnsigned(t);
    }
    shru(t) {
      return this.shiftRightUnsigned(t);
    }
    subtract(t) {
      return _Ht.isLong(t) || (t = _Ht.fromValue(t)), this.add(t.neg());
    }
    sub(t) {
      return this.subtract(t);
    }
    toInt() {
      return this.unsigned ? this.low >>> 0 : this.low;
    }
    toNumber() {
      return this.unsigned ? (this.high >>> 0) * xt + (this.low >>> 0) : this.high * xt + (this.low >>> 0);
    }
    toBigInt() {
      return BigInt(this.toString());
    }
    toBytes(t) {
      return t ? this.toBytesLE() : this.toBytesBE();
    }
    toBytesLE() {
      const t = this.high, e = this.low;
      return [255 & e, e >>> 8 & 255, e >>> 16 & 255, e >>> 24, 255 & t, t >>> 8 & 255, t >>> 16 & 255, t >>> 24];
    }
    toBytesBE() {
      const t = this.high, e = this.low;
      return [t >>> 24, t >>> 16 & 255, t >>> 8 & 255, 255 & t, e >>> 24, e >>> 16 & 255, e >>> 8 & 255, 255 & e];
    }
    toSigned() {
      return this.unsigned ? _Ht.fromBits(this.low, this.high, false) : this;
    }
    toString(t) {
      if ((t = t || 10) < 2 || 36 < t) throw new q("radix");
      if (this.isZero()) return "0";
      if (this.isNegative()) {
        if (this.eq(_Ht.MIN_VALUE)) {
          const e2 = _Ht.fromNumber(t), n3 = this.div(e2), i3 = n3.mul(e2).sub(this);
          return n3.toString(t) + i3.toInt().toString(t);
        }
        return "-" + this.neg().toString(t);
      }
      const e = _Ht.fromNumber(Math.pow(t, 6), this.unsigned);
      let n2 = this, i2 = "";
      for (; ; ) {
        const l2 = n2.div(e);
        let o = (n2.sub(l2.mul(e)).toInt() >>> 0).toString(t);
        if (n2 = l2, n2.isZero()) return o + i2;
        for (; o.length < 6; ) o = "0" + o;
        i2 = "" + o + i2;
      }
    }
    toUnsigned() {
      return this.unsigned ? this : _Ht.fromBits(this.low, this.high, true);
    }
    xor(t) {
      return _Ht.isLong(t) || (t = _Ht.fromValue(t)), _Ht.fromBits(this.low ^ t.low, this.high ^ t.high, this.unsigned);
    }
    eqz() {
      return this.isZero();
    }
    le(t) {
      return this.lessThanOrEqual(t);
    }
    toExtendedJSON(t) {
      return t && t.relaxed ? this.toNumber() : { $numberLong: this.toString() };
    }
    static fromExtendedJSON(t, e) {
      const { useBigInt64: n2 = false, relaxed: i2 = true } = { ...e };
      if (t.$numberLong.length > 20) throw new q("$numberLong string is too long");
      if (!kt.test(t.$numberLong)) throw new q(`$numberLong string "${t.$numberLong}" is in an invalid format`);
      if (n2) {
        const e2 = BigInt(t.$numberLong);
        return BigInt.asIntN(64, e2);
      }
      const l2 = _Ht.fromString(t.$numberLong);
      return i2 ? l2.toNumber() : l2;
    }
    inspect(t, e, n2) {
      n2 ??= V;
      return `new Long(${n2(this.toString(), e)}${this.unsigned ? `, ${n2(this.unsigned, e)}` : ""})`;
    }
  };
  var Bt = /^(\+|-)?(\d+|(\d*\.\d*))?(E|e)?([-+])?(\d+)?$/;
  var Ct = /^(\+|-)?(Infinity|inf)$/i;
  var vt = /^(\+|-)?NaN$/i;
  var jt = 6111;
  var Mt = -6176;
  var Pt = ht.fromNumberArray([124, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].reverse());
  var Ft = ht.fromNumberArray([248, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].reverse());
  var Qt = ht.fromNumberArray([120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].reverse());
  var Ot = /^([-+])?(\d+)?$/;
  function Et(t) {
    return !isNaN(parseInt(t, 10));
  }
  function _t(t) {
    const e = Ht.fromNumber(1e9);
    let n2 = Ht.fromNumber(0);
    if (!(t.parts[0] || t.parts[1] || t.parts[2] || t.parts[3])) return { quotient: t, rem: n2 };
    for (let i2 = 0; i2 <= 3; i2++) n2 = n2.shiftLeft(32), n2 = n2.add(new Ht(t.parts[i2], 0)), t.parts[i2] = n2.div(e).low, n2 = n2.modulo(e);
    return { quotient: t, rem: n2 };
  }
  function Dt(t, e) {
    throw new q(`"${t}" is not a valid Decimal128 string - ${e}`);
  }
  var At = class _At extends yt {
    get _bsontype() {
      return "Decimal128";
    }
    bytes;
    constructor(t) {
      if (super(), "string" == typeof t) this.bytes = _At.fromString(t).bytes;
      else {
        if (!(t instanceof Uint8Array || h(t))) throw new q("Decimal128 must take a Buffer or string");
        if (16 !== t.byteLength) throw new q("Decimal128 must take a Buffer of 16 bytes");
        this.bytes = t;
      }
    }
    static fromString(t) {
      return _At._fromString(t, { allowRounding: false });
    }
    static fromStringWithRounding(t) {
      return _At._fromString(t, { allowRounding: true });
    }
    static _fromString(t, e) {
      let n2 = false, i2 = false, l2 = false, o = false, c = 0, s = 0, a = 0, d = 0, b = 0;
      const Z = [0];
      let m = 0, u = 0, r2 = 0, h2 = 0, p2 = new Ht(0, 0), y2 = new Ht(0, 0), X2 = 0, G2 = 0;
      if (t.length >= 7e3) throw new q(t + " not a valid Decimal128 string");
      const V2 = t.match(Bt), W2 = t.match(Ct), f2 = t.match(vt);
      if (!V2 && !W2 && !f2 || 0 === t.length) throw new q(t + " not a valid Decimal128 string");
      if (V2) {
        const e2 = V2[2], n3 = V2[4], i3 = V2[5], l3 = V2[6];
        n3 && void 0 === l3 && Dt(t, "missing exponent power"), n3 && void 0 === e2 && Dt(t, "missing exponent base"), void 0 === n3 && (i3 || l3) && Dt(t, "missing e before exponent");
      }
      if ("+" !== t[G2] && "-" !== t[G2] || (i2 = true, n2 = "-" === t[G2++]), !Et(t[G2]) && "." !== t[G2]) {
        if ("i" === t[G2] || "I" === t[G2]) return new _At(n2 ? Ft : Qt);
        if ("N" === t[G2]) return new _At(Pt);
      }
      for (; Et(t[G2]) || "." === t[G2]; ) "." !== t[G2] ? (m < 34 && ("0" !== t[G2] || o) && (o || (b = s), o = true, Z[u++] = parseInt(t[G2], 10), m += 1), o && (a += 1), l2 && (d += 1), s += 1, G2 += 1) : (l2 && Dt(t, "contains multiple periods"), l2 = true, G2 += 1);
      if (l2 && !s) throw new q(t + " not a valid Decimal128 string");
      if ("e" === t[G2] || "E" === t[G2]) {
        const e2 = t.substr(++G2).match(Ot);
        if (!e2 || !e2[2]) return new _At(Pt);
        h2 = parseInt(e2[0], 10), G2 += e2[0].length;
      }
      if (t[G2]) return new _At(Pt);
      if (m) {
        if (r2 = m - 1, c = a, 1 !== c) for (; "0" === t[b + c - 1 + Number(i2) + Number(l2)]; ) c -= 1;
      } else Z[0] = 0, a = 1, m = 1, c = 0;
      for (h2 <= d && d > h2 + 16384 ? h2 = Mt : h2 -= d; h2 > jt; ) {
        if (r2 += 1, r2 >= 34) {
          if (0 === c) {
            h2 = jt;
            break;
          }
          Dt(t, "overflow");
        }
        h2 -= 1;
      }
      if (e.allowRounding) {
        for (; h2 < Mt || m < a; ) {
          if (0 === r2 && c < m) {
            h2 = Mt, c = 0;
            break;
          }
          if (m < a ? a -= 1 : r2 -= 1, h2 < jt) h2 += 1;
          else {
            if (Z.join("").match(/^0+$/)) {
              h2 = jt;
              break;
            }
            Dt(t, "overflow");
          }
        }
        if (r2 + 1 < c) {
          let e2 = s;
          l2 && (b += 1, e2 += 1), i2 && (b += 1, e2 += 1);
          const o2 = parseInt(t[b + r2 + 1], 10);
          let c2 = 0;
          if (o2 >= 5 && (c2 = 1, 5 === o2)) {
            c2 = Z[r2] % 2 == 1 ? 1 : 0;
            for (let n3 = b + r2 + 2; n3 < e2; n3++) if (parseInt(t[n3], 10)) {
              c2 = 1;
              break;
            }
          }
          if (c2) {
            let t2 = r2;
            for (; t2 >= 0 && ++Z[t2] > 9; t2--) if (Z[t2] = 0, 0 === t2) {
              if (!(h2 < jt)) return new _At(n2 ? Ft : Qt);
              h2 += 1, Z[t2] = 1;
            }
          }
        }
      } else {
        for (; h2 < Mt || m < a; ) {
          if (0 === r2) {
            if (0 === c) {
              h2 = Mt;
              break;
            }
            Dt(t, "exponent underflow");
          }
          m < a ? ("0" !== t[a - 1 + Number(i2) + Number(l2)] && 0 !== c && Dt(t, "inexact rounding"), a -= 1) : (0 !== Z[r2] && Dt(t, "inexact rounding"), r2 -= 1), h2 < jt ? h2 += 1 : Dt(t, "overflow");
        }
        if (r2 + 1 < c) {
          l2 && (b += 1), i2 && (b += 1);
          0 !== parseInt(t[b + r2 + 1], 10) && Dt(t, "inexact rounding");
        }
      }
      if (p2 = Ht.fromNumber(0), y2 = Ht.fromNumber(0), 0 === c) p2 = Ht.fromNumber(0), y2 = Ht.fromNumber(0);
      else if (r2 < 17) {
        let t2 = 0;
        for (y2 = Ht.fromNumber(Z[t2++]), p2 = new Ht(0, 0); t2 <= r2; t2++) y2 = y2.multiply(Ht.fromNumber(10)), y2 = y2.add(Ht.fromNumber(Z[t2]));
      } else {
        let t2 = 0;
        for (p2 = Ht.fromNumber(Z[t2++]); t2 <= r2 - 17; t2++) p2 = p2.multiply(Ht.fromNumber(10)), p2 = p2.add(Ht.fromNumber(Z[t2]));
        for (y2 = Ht.fromNumber(Z[t2++]); t2 <= r2; t2++) y2 = y2.multiply(Ht.fromNumber(10)), y2 = y2.add(Ht.fromNumber(Z[t2]));
      }
      const g2 = (function(t2, e2) {
        if (!t2 && !e2) return { high: Ht.fromNumber(0), low: Ht.fromNumber(0) };
        const n3 = t2.shiftRightUnsigned(32), i3 = new Ht(t2.getLowBits(), 0), l3 = e2.shiftRightUnsigned(32), o2 = new Ht(e2.getLowBits(), 0);
        let c2 = n3.multiply(l3), s2 = n3.multiply(o2);
        const a2 = i3.multiply(l3);
        let d2 = i3.multiply(o2);
        return c2 = c2.add(s2.shiftRightUnsigned(32)), s2 = new Ht(s2.getLowBits(), 0).add(a2).add(d2.shiftRightUnsigned(32)), c2 = c2.add(s2.shiftRightUnsigned(32)), d2 = s2.shiftLeft(32).add(new Ht(d2.getLowBits(), 0)), { high: c2, low: d2 };
      })(p2, Ht.fromString("100000000000000000"));
      g2.low = g2.low.add(y2), (function(t2, e2) {
        const n3 = t2.high >>> 0, i3 = e2.high >>> 0;
        if (n3 < i3) return true;
        if (n3 === i3 && t2.low >>> 0 < e2.low >>> 0) return true;
        return false;
      })(g2.low, y2) && (g2.high = g2.high.add(Ht.fromNumber(1))), X2 = h2 + 6176;
      const Y2 = { low: Ht.fromNumber(0), high: Ht.fromNumber(0) };
      g2.high.shiftRightUnsigned(49).and(Ht.fromNumber(1)).equals(Ht.fromNumber(1)) ? (Y2.high = Y2.high.or(Ht.fromNumber(3).shiftLeft(61)), Y2.high = Y2.high.or(Ht.fromNumber(X2).and(Ht.fromNumber(16383).shiftLeft(47))), Y2.high = Y2.high.or(g2.high.and(Ht.fromNumber(140737488355327)))) : (Y2.high = Y2.high.or(Ht.fromNumber(16383 & X2).shiftLeft(49)), Y2.high = Y2.high.or(g2.high.and(Ht.fromNumber(562949953421311)))), Y2.low = g2.low, n2 && (Y2.high = Y2.high.or(Ht.fromString("9223372036854775808")));
      const I2 = ht.allocateUnsafe(16);
      return G2 = 0, I2[G2++] = 255 & Y2.low.low, I2[G2++] = Y2.low.low >> 8 & 255, I2[G2++] = Y2.low.low >> 16 & 255, I2[G2++] = Y2.low.low >> 24 & 255, I2[G2++] = 255 & Y2.low.high, I2[G2++] = Y2.low.high >> 8 & 255, I2[G2++] = Y2.low.high >> 16 & 255, I2[G2++] = Y2.low.high >> 24 & 255, I2[G2++] = 255 & Y2.high.low, I2[G2++] = Y2.high.low >> 8 & 255, I2[G2++] = Y2.high.low >> 16 & 255, I2[G2++] = Y2.high.low >> 24 & 255, I2[G2++] = 255 & Y2.high.high, I2[G2++] = Y2.high.high >> 8 & 255, I2[G2++] = Y2.high.high >> 16 & 255, I2[G2++] = Y2.high.high >> 24 & 255, new _At(I2);
    }
    toString() {
      let t, e = 0;
      const n2 = new Array(36);
      for (let t2 = 0; t2 < n2.length; t2++) n2[t2] = 0;
      let i2, l2, o, c = 0, s = false, a = { parts: [0, 0, 0, 0] };
      const d = [];
      c = 0;
      const b = this.bytes, Z = b[c++] | b[c++] << 8 | b[c++] << 16 | b[c++] << 24, m = b[c++] | b[c++] << 8 | b[c++] << 16 | b[c++] << 24, u = b[c++] | b[c++] << 8 | b[c++] << 16 | b[c++] << 24, r2 = b[c++] | b[c++] << 8 | b[c++] << 16 | b[c++] << 24;
      c = 0;
      ({ low: new Ht(Z, m), high: new Ht(u, r2) }).high.lessThan(Ht.ZERO) && d.push("-");
      const h2 = r2 >> 26 & 31;
      if (h2 >> 3 == 3) {
        if (30 === h2) return d.join("") + "Infinity";
        if (31 === h2) return "NaN";
        t = r2 >> 15 & 16383, i2 = 8 + (r2 >> 14 & 1);
      } else i2 = r2 >> 14 & 7, t = r2 >> 17 & 16383;
      const p2 = t - 6176;
      if (a.parts[0] = (16383 & r2) + ((15 & i2) << 14), a.parts[1] = u, a.parts[2] = m, a.parts[3] = Z, 0 === a.parts[0] && 0 === a.parts[1] && 0 === a.parts[2] && 0 === a.parts[3]) s = true;
      else for (o = 3; o >= 0; o--) {
        let t2 = 0;
        const e2 = _t(a);
        if (a = e2.quotient, t2 = e2.rem.low, t2) for (l2 = 8; l2 >= 0; l2--) n2[9 * o + l2] = t2 % 10, t2 = Math.floor(t2 / 10);
      }
      if (s) e = 1, n2[c] = 0;
      else for (e = 36; !n2[c]; ) e -= 1, c += 1;
      const y2 = e - 1 + p2;
      if (y2 >= 34 || y2 <= -7 || p2 > 0) {
        if (e > 34) return d.push("0"), p2 > 0 ? d.push(`E+${p2}`) : p2 < 0 && d.push(`E${p2}`), d.join("");
        d.push(`${n2[c++]}`), e -= 1, e && d.push(".");
        for (let t2 = 0; t2 < e; t2++) d.push(`${n2[c++]}`);
        d.push("E"), y2 > 0 ? d.push(`+${y2}`) : d.push(`${y2}`);
      } else if (p2 >= 0) for (let t2 = 0; t2 < e; t2++) d.push(`${n2[c++]}`);
      else {
        let t2 = e + p2;
        if (t2 > 0) for (let e2 = 0; e2 < t2; e2++) d.push(`${n2[c++]}`);
        else d.push("0");
        for (d.push("."); t2++ < 0; ) d.push("0");
        for (let i3 = 0; i3 < e - Math.max(t2 - 1, 0); i3++) d.push(`${n2[c++]}`);
      }
      return d.join("");
    }
    toJSON() {
      return { $numberDecimal: this.toString() };
    }
    toExtendedJSON() {
      return { $numberDecimal: this.toString() };
    }
    static fromExtendedJSON(t) {
      return _At.fromString(t.$numberDecimal);
    }
    inspect(t, e, n2) {
      n2 ??= V;
      return `new Decimal128(${n2(this.toString(), e)})`;
    }
  };
  var $t = class _$t extends yt {
    get _bsontype() {
      return "Double";
    }
    value;
    constructor(t) {
      super(), t instanceof Number && (t = t.valueOf()), this.value = +t;
    }
    static fromString(t) {
      const e = Number(t);
      if ("NaN" === t) return new _$t(NaN);
      if ("Infinity" === t) return new _$t(1 / 0);
      if ("-Infinity" === t) return new _$t(-1 / 0);
      if (!Number.isFinite(e)) throw new q(`Input: ${t} is not representable as a Double`);
      if (t.trim() !== t) throw new q(`Input: '${t}' contains whitespace`);
      if ("" === t) throw new q("Input is an empty string");
      if (/[^-0-9.+eE]/.test(t)) throw new q(`Input: '${t}' is not in decimal or exponential notation`);
      return new _$t(e);
    }
    valueOf() {
      return this.value;
    }
    toJSON() {
      return this.value;
    }
    toString(t) {
      return this.value.toString(t);
    }
    toExtendedJSON(t) {
      return t && (t.legacy || t.relaxed && isFinite(this.value)) ? this.value : Object.is(Math.sign(this.value), -0) ? { $numberDouble: "-0.0" } : { $numberDouble: Number.isInteger(this.value) ? this.value.toFixed(1) : this.value.toString() };
    }
    static fromExtendedJSON(t, e) {
      const n2 = parseFloat(t.$numberDouble);
      return e && e.relaxed ? n2 : new _$t(n2);
    }
    inspect(t, e, n2) {
      return n2 ??= V, `new Double(${n2(this.value, e)})`;
    }
  };
  var qt = class _qt extends yt {
    get _bsontype() {
      return "Int32";
    }
    value;
    constructor(t) {
      super(), t instanceof Number && (t = t.valueOf()), this.value = 0 | +t;
    }
    static fromString(t) {
      const e = Tt(t), n2 = Number(t);
      if (g < n2) throw new q(`Input: '${t}' is larger than the maximum value for Int32`);
      if (Y > n2) throw new q(`Input: '${t}' is smaller than the minimum value for Int32`);
      if (!Number.isSafeInteger(n2)) throw new q(`Input: '${t}' is not a safe integer`);
      if (n2.toString() !== e) throw new q(`Input: '${t}' is not a valid Int32 string`);
      return new _qt(n2);
    }
    valueOf() {
      return this.value;
    }
    toString(t) {
      return this.value.toString(t);
    }
    toJSON() {
      return this.value;
    }
    toExtendedJSON(t) {
      return t && (t.relaxed || t.legacy) ? this.value : { $numberInt: this.value.toString() };
    }
    static fromExtendedJSON(t, e) {
      return e && e.relaxed ? parseInt(t.$numberInt, 10) : new _qt(t.$numberInt);
    }
    inspect(t, e, n2) {
      return n2 ??= V, `new Int32(${n2(this.value, e)})`;
    }
  };
  var te = class _te extends yt {
    get _bsontype() {
      return "MaxKey";
    }
    toExtendedJSON() {
      return { $maxKey: 1 };
    }
    static fromExtendedJSON() {
      return new _te();
    }
    inspect() {
      return "new MaxKey()";
    }
  };
  var ee = class _ee extends yt {
    get _bsontype() {
      return "MinKey";
    }
    toExtendedJSON() {
      return { $minKey: 1 };
    }
    static fromExtendedJSON() {
      return new _ee();
    }
    inspect() {
      return "new MinKey()";
    }
  };
  var ne = null;
  var ie = /* @__PURE__ */ new WeakMap();
  var le = class _le extends yt {
    get _bsontype() {
      return "ObjectId";
    }
    static index = Math.floor(16777215 * Math.random());
    static cacheHexString;
    buffer;
    constructor(t) {
      let e;
      if (super(), "object" == typeof t && t && "id" in t) {
        if ("string" != typeof t.id && !ArrayBuffer.isView(t.id)) throw new q("Argument passed in must have an id that is of type string or Buffer");
        e = "toHexString" in t && "function" == typeof t.toHexString ? ht.fromHex(t.toHexString()) : t.id;
      } else e = t;
      if (null == e) this.buffer = _le.generate();
      else if (ArrayBuffer.isView(e) && 12 === e.byteLength) this.buffer = ht.toLocalBufferType(e);
      else {
        if ("string" != typeof e) throw new q("Argument passed in does not match the accepted types");
        if (!_le.validateHexString(e)) throw new q("input must be a 24 character hex string, 12 byte Uint8Array, or an integer");
        this.buffer = ht.fromHex(e), _le.cacheHexString && ie.set(this, e);
      }
    }
    get id() {
      return this.buffer;
    }
    set id(t) {
      this.buffer = t, _le.cacheHexString && ie.set(this, ht.toHex(t));
    }
    static validateHexString(t) {
      if (24 !== t?.length) return false;
      for (let e = 0; e < 24; e++) {
        const n2 = t.charCodeAt(e);
        if (!(n2 >= 48 && n2 <= 57 || n2 >= 97 && n2 <= 102 || n2 >= 65 && n2 <= 70)) return false;
      }
      return true;
    }
    toHexString() {
      if (_le.cacheHexString) {
        const t2 = ie.get(this);
        if (t2) return t2;
      }
      const t = ht.toHex(this.id);
      return _le.cacheHexString && ie.set(this, t), t;
    }
    static getInc() {
      return _le.index = (_le.index + 1) % 16777215;
    }
    static generate(t) {
      "number" != typeof t && (t = Math.floor(Date.now() / 1e3));
      const e = _le.getInc(), n2 = ht.allocateUnsafe(12);
      return Wt.setInt32BE(n2, 0, t), null === ne && (ne = ht.randomBytes(5)), n2[4] = ne[0], n2[5] = ne[1], n2[6] = ne[2], n2[7] = ne[3], n2[8] = ne[4], n2[11] = 255 & e, n2[10] = e >> 8 & 255, n2[9] = e >> 16 & 255, n2;
    }
    toString(t) {
      return "base64" === t ? ht.toBase64(this.id) : this.toHexString();
    }
    toJSON() {
      return this.toHexString();
    }
    static is(t) {
      return null != t && "object" == typeof t && "_bsontype" in t && "ObjectId" === t._bsontype;
    }
    equals(t) {
      if (null == t) return false;
      if (_le.is(t)) return this.buffer[11] === t.buffer[11] && ht.equals(this.buffer, t.buffer);
      if ("string" == typeof t) return t.toLowerCase() === this.toHexString();
      if ("object" == typeof t && "function" == typeof t.toHexString) {
        const e = t.toHexString(), n2 = this.toHexString();
        return "string" == typeof e && e.toLowerCase() === n2;
      }
      return false;
    }
    getTimestamp() {
      const t = /* @__PURE__ */ new Date(), e = Wt.getUint32BE(this.buffer, 0);
      return t.setTime(1e3 * Math.floor(e)), t;
    }
    static createPk() {
      return new _le();
    }
    serializeInto(t, e) {
      return t[e] = this.buffer[0], t[e + 1] = this.buffer[1], t[e + 2] = this.buffer[2], t[e + 3] = this.buffer[3], t[e + 4] = this.buffer[4], t[e + 5] = this.buffer[5], t[e + 6] = this.buffer[6], t[e + 7] = this.buffer[7], t[e + 8] = this.buffer[8], t[e + 9] = this.buffer[9], t[e + 10] = this.buffer[10], t[e + 11] = this.buffer[11], 12;
    }
    static createFromTime(t) {
      const e = ht.allocate(12);
      for (let t2 = 11; t2 >= 4; t2--) e[t2] = 0;
      return Wt.setInt32BE(e, 0, t), new _le(e);
    }
    static createFromHexString(t) {
      if (24 !== t?.length) throw new q("hex string must be 24 characters");
      return new _le(ht.fromHex(t));
    }
    static createFromBase64(t) {
      if (16 !== t?.length) throw new q("base64 string must be 16 characters");
      return new _le(ht.fromBase64(t));
    }
    static isValid(t) {
      if (null == t) return false;
      if ("string" == typeof t) return _le.validateHexString(t);
      try {
        return new _le(t), true;
      } catch {
        return false;
      }
    }
    toExtendedJSON() {
      return this.toHexString ? { $oid: this.toHexString() } : { $oid: this.toString("hex") };
    }
    static fromExtendedJSON(t) {
      return new _le(t.$oid);
    }
    isCached() {
      return _le.cacheHexString && ie.has(this);
    }
    inspect(t, e, n2) {
      return n2 ??= V, `new ObjectId(${n2(this.toHexString(), e)})`;
    }
  };
  function oe(t, e, n2) {
    let i2 = 5;
    if (Array.isArray(t)) for (let l2 = 0; l2 < t.length; l2++) i2 += ce(l2.toString(), t[l2], e, true, n2);
    else {
      "function" == typeof t?.toBSON && (t = t.toBSON());
      for (const l2 of Object.keys(t)) i2 += ce(l2, t[l2], e, false, n2);
    }
    return i2;
  }
  function ce(t, e, n2 = false, i2 = false, l2 = false) {
    switch ("function" == typeof e?.toBSON && (e = e.toBSON()), typeof e) {
      case "string":
        return 1 + ht.utf8ByteLength(t) + 1 + 4 + ht.utf8ByteLength(e) + 1;
      case "number":
        return Math.floor(e) === e && e >= J && e <= S && e >= Y && e <= g ? (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 5 : (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 9;
      case "undefined":
        return i2 || !l2 ? (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 1 : 0;
      case "boolean":
        return (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 2;
      case "object":
        if (null != e && "string" == typeof e._bsontype && e[f] !== W) throw new tt();
        if (null == e || "MinKey" === e._bsontype || "MaxKey" === e._bsontype) return (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 1;
        if ("ObjectId" === e._bsontype) return (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 13;
        if (e instanceof Date || G(e)) return (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 9;
        if (ArrayBuffer.isView(e) || e instanceof ArrayBuffer || p(e)) return (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 6 + e.byteLength;
        if ("Long" === e._bsontype || "Double" === e._bsontype || "Timestamp" === e._bsontype) return (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 9;
        if ("Decimal128" === e._bsontype) return (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 17;
        if ("Code" === e._bsontype) return null != e.scope && Object.keys(e.scope).length > 0 ? (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 1 + 4 + 4 + ht.utf8ByteLength(e.code.toString()) + 1 + oe(e.scope, n2, l2) : (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 1 + 4 + ht.utf8ByteLength(e.code.toString()) + 1;
        if ("Binary" === e._bsontype) {
          const n3 = e;
          return n3.sub_type === ft.SUBTYPE_BYTE_ARRAY ? (null != t ? ht.utf8ByteLength(t) + 1 : 0) + (n3.position + 1 + 4 + 1 + 4) : (null != t ? ht.utf8ByteLength(t) + 1 : 0) + (n3.position + 1 + 4 + 1);
        }
        if ("Symbol" === e._bsontype) return (null != t ? ht.utf8ByteLength(t) + 1 : 0) + ht.utf8ByteLength(e.value) + 4 + 1 + 1;
        if ("DBRef" === e._bsontype) {
          const i3 = Object.assign({ $ref: e.collection, $id: e.oid }, e.fields);
          return null != e.db && (i3.$db = e.db), (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 1 + oe(i3, n2, l2);
        }
        return e instanceof RegExp || y(e) ? (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 1 + ht.utf8ByteLength(e.source) + 1 + (e.global ? 1 : 0) + (e.ignoreCase ? 1 : 0) + (e.multiline ? 1 : 0) + 1 : "BSONRegExp" === e._bsontype ? (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 1 + ht.utf8ByteLength(e.pattern) + 1 + ht.utf8ByteLength(e.options) + 1 : (null != t ? ht.utf8ByteLength(t) + 1 : 0) + oe(e, n2, l2) + 1;
      case "function":
        return n2 ? (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 1 + 4 + ht.utf8ByteLength(e.toString()) + 1 : 0;
      case "bigint":
        return (null != t ? ht.utf8ByteLength(t) + 1 : 0) + 9;
      case "symbol":
        return 0;
      default:
        throw new q("Unrecognized JS type: " + typeof e);
    }
  }
  var se = class _se extends yt {
    get _bsontype() {
      return "BSONRegExp";
    }
    pattern;
    options;
    constructor(t, e) {
      if (super(), this.pattern = t, this.options = (e ?? "").split("").sort().join(""), -1 !== this.pattern.indexOf("\0")) throw new q(`BSON Regex patterns cannot contain null bytes, found: ${JSON.stringify(this.pattern)}`);
      if (-1 !== this.options.indexOf("\0")) throw new q(`BSON Regex options cannot contain null bytes, found: ${JSON.stringify(this.options)}`);
      for (let t2 = 0; t2 < this.options.length; t2++) if ("i" !== this.options[t2] && "m" !== this.options[t2] && "x" !== this.options[t2] && "l" !== this.options[t2] && "s" !== this.options[t2] && "u" !== this.options[t2]) throw new q(`The regular expression option [${this.options[t2]}] is not supported`);
    }
    static parseOptions(t) {
      return t ? t.split("").sort().join("") : "";
    }
    toExtendedJSON(t) {
      return (t = t || {}).legacy ? { $regex: this.pattern, $options: this.options } : { $regularExpression: { pattern: this.pattern, options: this.options } };
    }
    static fromExtendedJSON(t) {
      if ("$regex" in t) {
        if ("string" == typeof t.$regex) return new _se(t.$regex, _se.parseOptions(t.$options));
        if ("BSONRegExp" === t.$regex._bsontype) return t;
      }
      if ("$regularExpression" in t) return new _se(t.$regularExpression.pattern, _se.parseOptions(t.$regularExpression.options));
      throw new q(`Unexpected BSONRegExp EJSON object form: ${JSON.stringify(t)}`);
    }
    inspect(t, e, n2) {
      const i2 = (function(t2) {
        if (null != t2 && "object" == typeof t2 && "stylize" in t2 && "function" == typeof t2.stylize) return t2.stylize;
      })(e) ?? ((t2) => t2);
      n2 ??= V;
      return `new BSONRegExp(${i2(n2(this.pattern), "regexp")}, ${i2(n2(this.options), "regexp")})`;
    }
  };
  var ae = class _ae extends yt {
    get _bsontype() {
      return "BSONSymbol";
    }
    value;
    constructor(t) {
      super(), this.value = t;
    }
    valueOf() {
      return this.value;
    }
    toString() {
      return this.value;
    }
    toJSON() {
      return this.value;
    }
    toExtendedJSON() {
      return { $symbol: this.value };
    }
    static fromExtendedJSON(t) {
      return new _ae(t.$symbol);
    }
    inspect(t, e, n2) {
      return n2 ??= V, `new BSONSymbol(${n2(this.value, e)})`;
    }
  };
  var de = Ht;
  var be = class _be extends de {
    get _bsontype() {
      return "Timestamp";
    }
    get [pt]() {
      return "Timestamp";
    }
    static MAX_VALUE = Ht.MAX_UNSIGNED_VALUE;
    get i() {
      return this.low >>> 0;
    }
    get t() {
      return this.high >>> 0;
    }
    constructor(t) {
      if (null == t) super(0, 0, true);
      else if ("bigint" == typeof t) super(t, true);
      else if (Ht.isLong(t)) super(t.low, t.high, true);
      else {
        if ("object" != typeof t || !("t" in t) || !("i" in t)) throw new q("A Timestamp can only be constructed with: bigint, Long, or { t: number; i: number }");
        {
          if ("number" != typeof t.t && ("object" != typeof t.t || "Int32" !== t.t._bsontype)) throw new q("Timestamp constructed from { t, i } must provide t as a number");
          if ("number" != typeof t.i && ("object" != typeof t.i || "Int32" !== t.i._bsontype)) throw new q("Timestamp constructed from { t, i } must provide i as a number");
          const e = Number(t.t), n2 = Number(t.i);
          if (e < 0 || Number.isNaN(e)) throw new q("Timestamp constructed from { t, i } must provide a positive t");
          if (n2 < 0 || Number.isNaN(n2)) throw new q("Timestamp constructed from { t, i } must provide a positive i");
          if (e > 4294967295) throw new q("Timestamp constructed from { t, i } must provide t equal or less than uint32 max");
          if (n2 > 4294967295) throw new q("Timestamp constructed from { t, i } must provide i equal or less than uint32 max");
          super(n2, e, true);
        }
      }
    }
    toJSON() {
      return { $timestamp: this.toString() };
    }
    static fromInt(t) {
      return new _be(Ht.fromInt(t, true));
    }
    static fromNumber(t) {
      return new _be(Ht.fromNumber(t, true));
    }
    static fromBits(t, e) {
      return new _be({ i: t, t: e });
    }
    static fromString(t, e) {
      return new _be(Ht.fromString(t, true, e));
    }
    toExtendedJSON() {
      return { $timestamp: { t: this.t, i: this.i } };
    }
    static fromExtendedJSON(t) {
      const e = Ht.isLong(t.$timestamp.i) ? t.$timestamp.i.getLowBitsUnsigned() : t.$timestamp.i, n2 = Ht.isLong(t.$timestamp.t) ? t.$timestamp.t.getLowBitsUnsigned() : t.$timestamp.t;
      return new _be({ t: n2, i: e });
    }
    inspect(t, e, n2) {
      n2 ??= V;
      return `new Timestamp({ t: ${n2(this.t, e)}, i: ${n2(this.i, e)} })`;
    }
  };
  var Ze = Ht.fromNumber(S);
  var me = Ht.fromNumber(J);
  function ue(t, e, n2) {
    const i2 = (e = null == e ? {} : e) && e.index ? e.index : 0, l2 = Wt.getInt32LE(t, i2);
    if (l2 < 5) throw new q(`bson size must be >= 5, is ${l2}`);
    if (e.allowObjectSmallerThanBufferSize && t.length < l2) throw new q(`buffer length ${t.length} must be >= bson size ${l2}`);
    if (!e.allowObjectSmallerThanBufferSize && t.length !== l2) throw new q(`buffer length ${t.length} must === bson size ${l2}`);
    if (l2 + i2 > t.byteLength) throw new q(`(bson size ${l2} + options.index ${i2} must be <= buffer length ${t.byteLength})`);
    if (0 !== t[i2 + l2 - 1]) throw new q("One object, sized correctly, with a spot for an EOO, but the EOO isn't 0x00");
    return he(t, i2, e, n2);
  }
  var re = /^\$ref$|^\$id$|^\$db$/;
  function he(t, e, n2, i2 = false) {
    const l2 = null == n2.fieldsAsRaw ? null : n2.fieldsAsRaw, o = null != n2.raw && n2.raw, c = "boolean" == typeof n2.bsonRegExp && n2.bsonRegExp, s = n2.promoteBuffers ?? false, a = n2.promoteLongs ?? true, d = n2.promoteValues ?? true, b = n2.useBigInt64 ?? false;
    if (b && !d) throw new q("Must either request bigint or Long for int64 deserialization");
    if (b && !a) throw new q("Must either request bigint or Long for int64 deserialization");
    let Z, m, u = true;
    const r2 = (null == n2.validation ? { utf8: true } : n2.validation).utf8;
    if ("boolean" == typeof r2) Z = r2;
    else {
      u = false;
      const t2 = Object.keys(r2).map((function(t3) {
        return r2[t3];
      }));
      if (0 === t2.length) throw new q("UTF-8 validation setting cannot be empty");
      if ("boolean" != typeof t2[0]) throw new q("Invalid UTF-8 validation option, must specify boolean values");
      if (Z = t2[0], !t2.every(((t3) => t3 === Z))) throw new q("Invalid UTF-8 validation option - keys must be all true or all false");
    }
    if (!u) {
      m = /* @__PURE__ */ new Set();
      for (const t2 of Object.keys(r2)) m.add(t2);
    }
    const h2 = e;
    if (t.length < 5) throw new q("corrupt bson message < 5 bytes long");
    const p2 = Wt.getInt32LE(t, e);
    if (e += 4, p2 < 5 || p2 > t.length) throw new q("corrupt bson message");
    const y2 = i2 ? [] : {};
    let X2 = 0, G2 = !i2 && null;
    for (; ; ) {
      const r3 = t[e++];
      if (0 === r3) break;
      let h3 = e;
      for (; 0 !== t[h3] && h3 < t.length; ) h3++;
      if (h3 >= t.byteLength) throw new q("Bad BSON Document: illegal CString");
      const p3 = i2 ? X2++ : ht.toUTF8(t, e, h3, false);
      let V2, W2 = true;
      if (W2 = u || m?.has(p3) ? Z : !Z, false !== G2 && "$" === p3[0] && (G2 = re.test(p3)), e = h3 + 1, r3 === T) {
        const n3 = Wt.getInt32LE(t, e);
        if (e += 4, n3 <= 0 || n3 > t.length - e || 0 !== t[e + n3 - 1]) throw new q("bad string length in bson");
        V2 = ht.toUTF8(t, e, e + n3 - 1, W2), e += n3;
      } else if (r3 === N) {
        const n3 = ht.allocateUnsafe(12);
        for (let i3 = 0; i3 < 12; i3++) n3[i3] = t[e + i3];
        V2 = new le(n3), e += 12;
      } else if (r3 === P && false === d) V2 = new qt(Wt.getInt32LE(t, e)), e += 4;
      else if (r3 === P) V2 = Wt.getInt32LE(t, e), e += 4;
      else if (r3 === K) V2 = Wt.getFloat64LE(t, e), e += 8, false === d && (V2 = new $t(V2));
      else if (r3 === k) {
        const n3 = Wt.getInt32LE(t, e), i3 = Wt.getInt32LE(t, e + 4);
        e += 8, V2 = new Date(new Ht(n3, i3).toNumber());
      } else if (r3 === w) {
        if (0 !== t[e] && 1 !== t[e]) throw new q("illegal boolean type value");
        V2 = 1 === t[e++];
      } else if (r3 === L) {
        const i3 = e, l3 = Wt.getInt32LE(t, e);
        if (l3 <= 0 || l3 > t.length - e) throw new q("bad embedded document length in bson");
        if (o) V2 = t.subarray(e, e + l3);
        else {
          let e2 = n2;
          u || (e2 = { ...n2, validation: { utf8: W2 } }), V2 = he(t, i3, e2, false);
        }
        e += l3;
      } else if (r3 === x) {
        const i3 = e, o2 = Wt.getInt32LE(t, e);
        let c2 = n2;
        const s2 = e + o2;
        if (l2 && l2[p3] && (c2 = { ...n2, raw: true }), u || (c2 = { ...c2, validation: { utf8: W2 } }), V2 = he(t, i3, c2, true), 0 !== t[(e += o2) - 1]) throw new q("invalid array terminator byte");
        if (e !== s2) throw new q("corrupted array bson");
      } else if (r3 === z) V2 = void 0;
      else if (r3 === H) V2 = null;
      else if (r3 === Q) if (b) V2 = Wt.getBigInt64LE(t, e), e += 8;
      else {
        const n3 = Wt.getInt32LE(t, e), i3 = Wt.getInt32LE(t, e + 4);
        e += 8;
        const l3 = new Ht(n3, i3);
        V2 = a && true === d && l3.lessThanOrEqual(Ze) && l3.greaterThanOrEqual(me) ? l3.toNumber() : l3;
      }
      else if (r3 === O) {
        const n3 = ht.allocateUnsafe(16);
        for (let i3 = 0; i3 < 16; i3++) n3[i3] = t[e + i3];
        e += 16, V2 = new At(n3);
      } else if (r3 === U) {
        let n3 = Wt.getInt32LE(t, e);
        e += 4;
        const i3 = n3, l3 = t[e++];
        if (n3 < 0) throw new q("Negative binary type element size found");
        if (n3 > t.byteLength) throw new q("Binary type size larger than document size");
        if (l3 === ft.SUBTYPE_BYTE_ARRAY) {
          if (n3 = Wt.getInt32LE(t, e), e += 4, n3 < 0) throw new q("Negative binary type element size found for subtype 0x02");
          if (n3 > i3 - 4) throw new q("Binary type with subtype 0x02 contains too long binary size");
          if (n3 < i3 - 4) throw new q("Binary type with subtype 0x02 contains too short binary size");
        }
        s && d ? V2 = ht.toLocalBufferType(t.subarray(e, e + n3)) : (V2 = new ft(t.subarray(e, e + n3), l3), l3 === A && Rt.isValid(V2) && (V2 = V2.toUUID())), e += n3;
      } else if (r3 === B && false === c) {
        for (h3 = e; 0 !== t[h3] && h3 < t.length; ) h3++;
        if (h3 >= t.length) throw new q("Bad BSON Document: illegal CString");
        const n3 = ht.toUTF8(t, e, h3, false);
        for (h3 = e = h3 + 1; 0 !== t[h3] && h3 < t.length; ) h3++;
        if (h3 >= t.length) throw new q("Bad BSON Document: illegal CString");
        const i3 = ht.toUTF8(t, e, h3, false);
        e = h3 + 1;
        const l3 = new Array(i3.length);
        for (h3 = 0; h3 < i3.length; h3++) switch (i3[h3]) {
          case "m":
            l3[h3] = "m";
            break;
          case "s":
            l3[h3] = "g";
            break;
          case "i":
            l3[h3] = "i";
        }
        V2 = new RegExp(n3, l3.join(""));
      } else if (r3 === B && true === c) {
        for (h3 = e; 0 !== t[h3] && h3 < t.length; ) h3++;
        if (h3 >= t.length) throw new q("Bad BSON Document: illegal CString");
        const n3 = ht.toUTF8(t, e, h3, false);
        for (h3 = e = h3 + 1; 0 !== t[h3] && h3 < t.length; ) h3++;
        if (h3 >= t.length) throw new q("Bad BSON Document: illegal CString");
        const i3 = ht.toUTF8(t, e, h3, false);
        e = h3 + 1, V2 = new se(n3, i3);
      } else if (r3 === j) {
        const n3 = Wt.getInt32LE(t, e);
        if (e += 4, n3 <= 0 || n3 > t.length - e || 0 !== t[e + n3 - 1]) throw new q("bad string length in bson");
        const i3 = ht.toUTF8(t, e, e + n3 - 1, W2);
        V2 = d ? i3 : new ae(i3), e += n3;
      } else if (r3 === F) V2 = new be({ i: Wt.getUint32LE(t, e), t: Wt.getUint32LE(t, e + 4) }), e += 8;
      else if (r3 === E) V2 = new ee();
      else if (r3 === _) V2 = new te();
      else if (r3 === v) {
        const n3 = Wt.getInt32LE(t, e);
        if (e += 4, n3 <= 0 || n3 > t.length - e || 0 !== t[e + n3 - 1]) throw new q("bad string length in bson");
        const i3 = ht.toUTF8(t, e, e + n3 - 1, W2);
        V2 = new St(i3), e += n3;
      } else if (r3 === M) {
        const i3 = Wt.getInt32LE(t, e);
        if (e += 4, i3 < 13) throw new q("code_w_scope total size shorter minimum expected length");
        const l3 = Wt.getInt32LE(t, e);
        if (e += 4, l3 <= 0 || l3 > t.length - e || 0 !== t[e + l3 - 1]) throw new q("bad string length in bson");
        const o2 = ht.toUTF8(t, e, e + l3 - 1, W2), c2 = e += l3, s2 = Wt.getInt32LE(t, e), a2 = he(t, c2, n2, false);
        if (e += s2, i3 < 8 + s2 + l3) throw new q("code_w_scope total size is too short, truncating scope");
        if (i3 > 8 + s2 + l3) throw new q("code_w_scope total size is too long, clips outer document");
        V2 = new St(o2, a2);
      } else {
        if (r3 !== C) throw new q(`Detected unknown BSON type ${r3.toString(16)} for fieldname "${p3}"`);
        {
          const n3 = Wt.getInt32LE(t, e);
          if (e += 4, n3 <= 0 || n3 > t.length - e || 0 !== t[e + n3 - 1]) throw new q("bad string length in bson");
          const i3 = ht.toUTF8(t, e, e + n3 - 1, W2);
          e += n3;
          const l3 = ht.allocateUnsafe(12);
          for (let n4 = 0; n4 < 12; n4++) l3[n4] = t[e + n4];
          const o2 = new le(l3);
          e += 12, V2 = new Kt(i3, o2);
        }
      }
      "__proto__" === p3 ? Object.defineProperty(y2, p3, { value: V2, writable: true, enumerable: true, configurable: true }) : y2[p3] = V2;
    }
    if (p2 !== e - h2) {
      if (i2) throw new q("corrupt array bson");
      throw new q("corrupt object bson");
    }
    if (!G2) return y2;
    if (Jt(y2)) {
      const t2 = Object.assign({}, y2);
      return delete t2.$ref, delete t2.$id, delete t2.$db, new Kt(y2.$ref, y2.$id, y2.$db, t2);
    }
    return y2;
  }
  var pe = /\x00/;
  var ye = /* @__PURE__ */ new Set(["$db", "$ref", "$id", "$clusterTime"]);
  function Xe(t, e, n2, i2) {
    t[i2++] = T;
    t[(i2 = i2 + ht.encodeUTF8Into(t, e, i2) + 1) - 1] = 0;
    const l2 = ht.encodeUTF8Into(t, n2, i2 + 4);
    return Wt.setInt32LE(t, i2, l2 + 1), i2 = i2 + 4 + l2, t[i2++] = 0, i2;
  }
  function Ge(t, e, n2, i2) {
    const l2 = !Object.is(n2, -0) && Number.isSafeInteger(n2) && n2 <= g && n2 >= Y ? P : K;
    t[i2++] = l2;
    return i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0, i2 += l2 === P ? Wt.setInt32LE(t, i2, n2) : Wt.setFloat64LE(t, i2, n2);
  }
  function Ve(t, e, n2, i2) {
    t[i2++] = Q;
    return i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0, i2 += Wt.setBigInt64LE(t, i2, n2);
  }
  function We(t, e, n2, i2) {
    t[i2++] = H;
    return i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0, i2;
  }
  function fe(t, e, n2, i2) {
    t[i2++] = w;
    return i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0, t[i2++] = n2 ? 1 : 0, i2;
  }
  function ge(t, e, n2, i2) {
    t[i2++] = k;
    i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0;
    const l2 = Ht.fromNumber(n2.getTime()), o = l2.getLowBits(), c = l2.getHighBits();
    return i2 += Wt.setInt32LE(t, i2, o), i2 += Wt.setInt32LE(t, i2, c);
  }
  function Ye(t, e, n2, i2) {
    t[i2++] = B;
    if (i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0, n2.source && null != n2.source.match(pe)) throw new q("value " + n2.source + " must not contain null bytes");
    return i2 += ht.encodeUTF8Into(t, n2.source, i2), t[i2++] = 0, n2.ignoreCase && (t[i2++] = 105), n2.global && (t[i2++] = 115), n2.multiline && (t[i2++] = 109), t[i2++] = 0, i2;
  }
  function Ie(t, e, n2, i2) {
    t[i2++] = B;
    if (i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0, null != n2.pattern.match(pe)) throw new q("pattern " + n2.pattern + " must not contain null bytes");
    i2 += ht.encodeUTF8Into(t, n2.pattern, i2), t[i2++] = 0;
    const l2 = n2.options.split("").sort().join("");
    return i2 += ht.encodeUTF8Into(t, l2, i2), t[i2++] = 0, i2;
  }
  function Re(t, e, n2, i2) {
    null === n2 ? t[i2++] = H : "MinKey" === n2._bsontype ? t[i2++] = E : t[i2++] = _;
    return i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0, i2;
  }
  function Se(t, e, n2, i2) {
    t[i2++] = N;
    return i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0, i2 += n2.serializeInto(t, i2);
  }
  function Je(t, e, n2, i2) {
    t[i2++] = U;
    i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0;
    const l2 = n2.length;
    if (i2 += Wt.setInt32LE(t, i2, l2), t[i2++] = D, l2 <= 16) for (let e2 = 0; e2 < l2; e2++) t[i2 + e2] = n2[e2];
    else t.set(n2, i2);
    return i2 += l2;
  }
  function Ke(t, e, n2, i2, l2, o, c, s, a) {
    if (a.has(n2)) throw new q("Cannot convert circular structure to BSON");
    a.add(n2), t[i2++] = Array.isArray(n2) ? x : L;
    i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0;
    const d = Be(t, n2, l2, i2, o + 1, c, s, a);
    return a.delete(n2), d;
  }
  function Te(t, e, n2, i2) {
    t[i2++] = O;
    i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0;
    for (let e2 = 0; e2 < 16; e2++) t[i2 + e2] = n2.bytes[e2];
    return i2 + 16;
  }
  function Le(t, e, n2, i2) {
    t[i2++] = "Long" === n2._bsontype ? Q : F;
    i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0;
    const l2 = n2.getLowBits(), o = n2.getHighBits();
    return i2 += Wt.setInt32LE(t, i2, l2), i2 += Wt.setInt32LE(t, i2, o);
  }
  function xe(t, e, n2, i2) {
    n2 = n2.valueOf(), t[i2++] = P;
    return i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0, i2 += Wt.setInt32LE(t, i2, n2);
  }
  function Ue(t, e, n2, i2) {
    t[i2++] = K;
    return i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0, i2 += Wt.setFloat64LE(t, i2, n2.value);
  }
  function ze(t, e, n2, i2) {
    t[i2++] = v;
    i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0;
    const l2 = n2.toString(), o = ht.encodeUTF8Into(t, l2, i2 + 4) + 1;
    return Wt.setInt32LE(t, i2, o), i2 = i2 + 4 + o - 1, t[i2++] = 0, i2;
  }
  function Ne(t, e, n2, i2, l2 = false, o = 0, c = false, s = true, a) {
    if (n2.scope && "object" == typeof n2.scope) {
      t[i2++] = M;
      i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0;
      let d = i2;
      const b = n2.code;
      i2 += 4;
      const Z = ht.encodeUTF8Into(t, b, i2 + 4) + 1;
      Wt.setInt32LE(t, i2, Z), t[i2 + 4 + Z - 1] = 0, i2 = i2 + Z + 4;
      const m = Be(t, n2.scope, l2, i2, o + 1, c, s, a);
      i2 = m - 1;
      const u = m - d;
      d += Wt.setInt32LE(t, d, u), t[i2++] = 0;
    } else {
      t[i2++] = v;
      i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0;
      const l3 = n2.code.toString(), o2 = ht.encodeUTF8Into(t, l3, i2 + 4) + 1;
      Wt.setInt32LE(t, i2, o2), i2 = i2 + 4 + o2 - 1, t[i2++] = 0;
    }
    return i2;
  }
  function we(t, e, n2, i2) {
    t[i2++] = U;
    i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0;
    const l2 = n2.buffer;
    let o = n2.position;
    if (n2.sub_type === ft.SUBTYPE_BYTE_ARRAY && (o += 4), i2 += Wt.setInt32LE(t, i2, o), t[i2++] = n2.sub_type, n2.sub_type === ft.SUBTYPE_BYTE_ARRAY && (o -= 4, i2 += Wt.setInt32LE(t, i2, o)), n2.sub_type === ft.SUBTYPE_VECTOR && gt(n2), o <= 16) for (let e2 = 0; e2 < o; e2++) t[i2 + e2] = l2[e2];
    else t.set(l2, i2);
    return i2 += n2.position;
  }
  function ke(t, e, n2, i2) {
    t[i2++] = j;
    i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0;
    const l2 = ht.encodeUTF8Into(t, n2.value, i2 + 4) + 1;
    return Wt.setInt32LE(t, i2, l2), i2 = i2 + 4 + l2 - 1, t[i2++] = 0, i2;
  }
  function He(t, e, n2, i2, l2, o, c) {
    t[i2++] = L;
    i2 += ht.encodeUTF8Into(t, e, i2), t[i2++] = 0;
    let s = i2, a = { $ref: n2.collection || n2.namespace, $id: n2.oid };
    null != n2.db && (a.$db = n2.db), a = Object.assign(a, n2.fields);
    const d = Be(t, a, false, i2, l2 + 1, o, true, c), b = d - s;
    return s += Wt.setInt32LE(t, i2, b), d;
  }
  function Be(t, e, n2, i2, l2, o, c, s) {
    if (null == s) {
      if (null == e) return t[0] = 5, t[1] = 0, t[2] = 0, t[3] = 0, t[4] = 0, 5;
      if (Array.isArray(e)) throw new q("serialize does not support an array as the root input");
      if ("object" != typeof e) throw new q("serialize does not support non-object as the root input");
      if ("_bsontype" in e && "string" == typeof e._bsontype) throw new q("BSON types cannot be serialized as a document");
      if (G(e) || y(e) || h(e) || p(e)) throw new q("date, regexp, typedarray, and arraybuffer cannot be BSON documents");
      s = /* @__PURE__ */ new Set();
    }
    s.add(e);
    let a = i2 + 4;
    if (Array.isArray(e)) for (let i3 = 0; i3 < e.length; i3++) {
      const d2 = `${i3}`;
      let b = e[i3];
      "function" == typeof b?.toBSON && (b = b.toBSON());
      const Z = typeof b;
      if (void 0 === b) a = We(t, d2, 0, a);
      else if (null === b) a = We(t, d2, 0, a);
      else if ("string" === Z) a = Xe(t, d2, b, a);
      else if ("number" === Z) a = Ge(t, d2, b, a);
      else if ("bigint" === Z) a = Ve(t, d2, b, a);
      else if ("boolean" === Z) a = fe(t, d2, b, a);
      else if ("object" === Z && null == b._bsontype) a = b instanceof Date || G(b) ? ge(t, d2, b, a) : b instanceof Uint8Array || h(b) ? Je(t, d2, b, a) : b instanceof RegExp || y(b) ? Ye(t, d2, b, a) : Ke(t, d2, b, a, n2, l2, o, c, s);
      else if ("object" === Z) {
        if (b[f] !== W) throw new tt();
        if ("ObjectId" === b._bsontype) a = Se(t, d2, b, a);
        else if ("Decimal128" === b._bsontype) a = Te(t, d2, b, a);
        else if ("Long" === b._bsontype || "Timestamp" === b._bsontype) a = Le(t, d2, b, a);
        else if ("Double" === b._bsontype) a = Ue(t, d2, b, a);
        else if ("Code" === b._bsontype) a = Ne(t, d2, b, a, n2, l2, o, c, s);
        else if ("Binary" === b._bsontype) a = we(t, d2, b, a);
        else if ("BSONSymbol" === b._bsontype) a = ke(t, d2, b, a);
        else if ("DBRef" === b._bsontype) a = He(t, d2, b, a, l2, o, s);
        else if ("BSONRegExp" === b._bsontype) a = Ie(t, d2, b, a);
        else if ("Int32" === b._bsontype) a = xe(t, d2, b, a);
        else if ("MinKey" === b._bsontype || "MaxKey" === b._bsontype) a = Re(t, d2, b, a);
        else if (void 0 !== b._bsontype) throw new q(`Unrecognized or invalid _bsontype: ${String(b._bsontype)}`);
      } else "function" === Z && o && (a = ze(t, d2, b, a));
    }
    else if (e instanceof Map || X(e)) {
      const i3 = e.entries();
      let d2 = false;
      for (; !d2; ) {
        const e2 = i3.next();
        if (d2 = !!e2.done, d2) continue;
        const b = e2.value ? e2.value[0] : void 0;
        let Z = e2.value ? e2.value[1] : void 0;
        "function" == typeof Z?.toBSON && (Z = Z.toBSON());
        const m = typeof Z;
        if ("string" == typeof b && !ye.has(b)) {
          if (null != b.match(pe)) throw new q("key " + b + " must not contain null bytes");
          if (n2) {
            if ("$" === b[0]) throw new q("key " + b + " must not start with '$'");
            if (b.includes(".")) throw new q("key " + b + " must not contain '.'");
          }
        }
        if (void 0 === Z) false === c && (a = We(t, b, 0, a));
        else if (null === Z) a = We(t, b, 0, a);
        else if ("string" === m) a = Xe(t, b, Z, a);
        else if ("number" === m) a = Ge(t, b, Z, a);
        else if ("bigint" === m) a = Ve(t, b, Z, a);
        else if ("boolean" === m) a = fe(t, b, Z, a);
        else if ("object" === m && null == Z._bsontype) a = Z instanceof Date || G(Z) ? ge(t, b, Z, a) : Z instanceof Uint8Array || h(Z) ? Je(t, b, Z, a) : Z instanceof RegExp || y(Z) ? Ye(t, b, Z, a) : Ke(t, b, Z, a, n2, l2, o, c, s);
        else if ("object" === m) {
          if (Z[f] !== W) throw new tt();
          if ("ObjectId" === Z._bsontype) a = Se(t, b, Z, a);
          else if ("Decimal128" === Z._bsontype) a = Te(t, b, Z, a);
          else if ("Long" === Z._bsontype || "Timestamp" === Z._bsontype) a = Le(t, b, Z, a);
          else if ("Double" === Z._bsontype) a = Ue(t, b, Z, a);
          else if ("Code" === Z._bsontype) a = Ne(t, b, Z, a, n2, l2, o, c, s);
          else if ("Binary" === Z._bsontype) a = we(t, b, Z, a);
          else if ("BSONSymbol" === Z._bsontype) a = ke(t, b, Z, a);
          else if ("DBRef" === Z._bsontype) a = He(t, b, Z, a, l2, o, s);
          else if ("BSONRegExp" === Z._bsontype) a = Ie(t, b, Z, a);
          else if ("Int32" === Z._bsontype) a = xe(t, b, Z, a);
          else if ("MinKey" === Z._bsontype || "MaxKey" === Z._bsontype) a = Re(t, b, Z, a);
          else if (void 0 !== Z._bsontype) throw new q(`Unrecognized or invalid _bsontype: ${String(Z._bsontype)}`);
        } else "function" === m && o && (a = ze(t, b, Z, a));
      }
    } else {
      if ("function" == typeof e?.toBSON && null != (e = e.toBSON()) && "object" != typeof e) throw new q("toBSON function did not return an object");
      for (const i3 of Object.keys(e)) {
        let d2 = e[i3];
        "function" == typeof d2?.toBSON && (d2 = d2.toBSON());
        const b = typeof d2;
        if ("string" == typeof i3 && !ye.has(i3)) {
          if (null != i3.match(pe)) throw new q("key " + i3 + " must not contain null bytes");
          if (n2) {
            if ("$" === i3[0]) throw new q("key " + i3 + " must not start with '$'");
            if (i3.includes(".")) throw new q("key " + i3 + " must not contain '.'");
          }
        }
        if (void 0 === d2) false === c && (a = We(t, i3, 0, a));
        else if (null === d2) a = We(t, i3, 0, a);
        else if ("string" === b) a = Xe(t, i3, d2, a);
        else if ("number" === b) a = Ge(t, i3, d2, a);
        else if ("bigint" === b) a = Ve(t, i3, d2, a);
        else if ("boolean" === b) a = fe(t, i3, d2, a);
        else if ("object" === b && null == d2._bsontype) a = d2 instanceof Date || G(d2) ? ge(t, i3, d2, a) : d2 instanceof Uint8Array || h(d2) ? Je(t, i3, d2, a) : d2 instanceof RegExp || y(d2) ? Ye(t, i3, d2, a) : Ke(t, i3, d2, a, n2, l2, o, c, s);
        else if ("object" === b) {
          if (d2[f] !== W) throw new tt();
          if ("ObjectId" === d2._bsontype) a = Se(t, i3, d2, a);
          else if ("Decimal128" === d2._bsontype) a = Te(t, i3, d2, a);
          else if ("Long" === d2._bsontype || "Timestamp" === d2._bsontype) a = Le(t, i3, d2, a);
          else if ("Double" === d2._bsontype) a = Ue(t, i3, d2, a);
          else if ("Code" === d2._bsontype) a = Ne(t, i3, d2, a, n2, l2, o, c, s);
          else if ("Binary" === d2._bsontype) a = we(t, i3, d2, a);
          else if ("BSONSymbol" === d2._bsontype) a = ke(t, i3, d2, a);
          else if ("DBRef" === d2._bsontype) a = He(t, i3, d2, a, l2, o, s);
          else if ("BSONRegExp" === d2._bsontype) a = Ie(t, i3, d2, a);
          else if ("Int32" === d2._bsontype) a = xe(t, i3, d2, a);
          else if ("MinKey" === d2._bsontype || "MaxKey" === d2._bsontype) a = Re(t, i3, d2, a);
          else if (void 0 !== d2._bsontype) throw new q(`Unrecognized or invalid _bsontype: ${String(d2._bsontype)}`);
        } else "function" === b && o && (a = ze(t, i3, d2, a));
      }
    }
    s.delete(e), t[a++] = 0;
    const d = a - i2;
    return i2 += Wt.setInt32LE(t, i2, d), a;
  }
  var Ce = { $oid: le, $binary: ft, $uuid: ft, $symbol: ae, $numberInt: qt, $numberDecimal: At, $numberDouble: $t, $numberLong: Ht, $minKey: ee, $maxKey: te, $regex: se, $regularExpression: se, $timestamp: be };
  function ve(t, e = {}) {
    if ("number" == typeof t) {
      const n3 = t <= g && t >= Y, i2 = t <= I && t >= R;
      if (e.relaxed || e.legacy) return t;
      if (Number.isInteger(t) && !Object.is(t, -0)) {
        if (n3) return new qt(t);
        if (i2) return e.useBigInt64 ? BigInt(t) : Ht.fromNumber(t);
      }
      return new $t(t);
    }
    if (null == t || "object" != typeof t) return t;
    if (t.$undefined) return null;
    const n2 = Object.keys(t).filter(((e2) => e2.startsWith("$") && null != t[e2]));
    for (let i2 = 0; i2 < n2.length; i2++) {
      const l2 = Ce[n2[i2]];
      if (l2) return l2.fromExtendedJSON(t, e);
    }
    if (null != t.$date) {
      const n3 = t.$date, i2 = /* @__PURE__ */ new Date();
      if (e.legacy) if ("number" == typeof n3) i2.setTime(n3);
      else if ("string" == typeof n3) i2.setTime(Date.parse(n3));
      else {
        if ("bigint" != typeof n3) throw new et("Unrecognized type for EJSON date: " + typeof n3);
        i2.setTime(Number(n3));
      }
      else if ("string" == typeof n3) i2.setTime(Date.parse(n3));
      else if (Ht.isLong(n3)) i2.setTime(n3.toNumber());
      else if ("number" == typeof n3 && e.relaxed) i2.setTime(n3);
      else {
        if ("bigint" != typeof n3) throw new et("Unrecognized type for EJSON date: " + typeof n3);
        i2.setTime(Number(n3));
      }
      return i2;
    }
    if (null != t.$code) {
      const e2 = Object.assign({}, t);
      return t.$scope && (e2.$scope = ve(t.$scope)), St.fromExtendedJSON(t);
    }
    if (Jt(t) || t.$dbPointer) {
      const e2 = t.$ref ? t : t.$dbPointer;
      if (e2 instanceof Kt) return e2;
      const n3 = Object.keys(e2).filter(((t2) => t2.startsWith("$")));
      let i2 = true;
      if (n3.forEach(((t2) => {
        -1 === ["$ref", "$id", "$db"].indexOf(t2) && (i2 = false);
      })), i2) return Kt.fromExtendedJSON(e2);
    }
    return t;
  }
  function je(t) {
    const e = t.toISOString();
    return 0 !== t.getUTCMilliseconds() ? e : e.slice(0, -5) + "Z";
  }
  function Me(t, e) {
    if (t instanceof Map || X(t)) {
      const n2 = /* @__PURE__ */ Object.create(null);
      for (const [e2, i2] of t) {
        if ("string" != typeof e2) throw new q("Can only serialize maps with string keys");
        n2[e2] = i2;
      }
      return Me(n2, e);
    }
    if (("object" == typeof t || "function" == typeof t) && null !== t) {
      const n2 = e.seenObjects.findIndex(((e2) => e2.obj === t));
      if (-1 !== n2) {
        const t2 = e.seenObjects.map(((t3) => t3.propertyName)), i2 = t2.slice(0, n2).map(((t3) => `${t3} -> `)).join(""), l2 = t2[n2], o = " -> " + t2.slice(n2 + 1, t2.length - 1).map(((t3) => `${t3} -> `)).join(""), c = t2[t2.length - 1], s = " ".repeat(i2.length + l2.length / 2), a = "-".repeat(o.length + (l2.length + c.length) / 2 - 1);
        throw new q(`Converting circular structure to EJSON:
    ${i2}${l2}${o}${c}
    ${s}\\${a}/`);
      }
      e.seenObjects[e.seenObjects.length - 1].obj = t;
    }
    if (Array.isArray(t)) return (function(t2, e2) {
      return t2.map(((t3, n2) => {
        e2.seenObjects.push({ propertyName: `index ${n2}`, obj: null });
        try {
          return Me(t3, e2);
        } finally {
          e2.seenObjects.pop();
        }
      }));
    })(t, e);
    if (void 0 === t) return e.ignoreUndefined ? void 0 : null;
    if (t instanceof Date || G(t)) {
      const n2 = t.getTime(), i2 = n2 > -1 && n2 < 2534023188e5;
      return e.legacy ? e.relaxed && i2 ? { $date: t.getTime() } : { $date: je(t) } : e.relaxed && i2 ? { $date: je(t) } : { $date: { $numberLong: t.getTime().toString() } };
    }
    if (!("number" != typeof t || e.relaxed && isFinite(t))) {
      if (Number.isInteger(t) && !Object.is(t, -0)) {
        if (t >= Y && t <= g) return { $numberInt: t.toString() };
        if (t >= R && t <= I) return { $numberLong: t.toString() };
      }
      return { $numberDouble: Object.is(t, -0) ? "-0.0" : t.toString() };
    }
    if ("bigint" == typeof t) return e.relaxed ? Number(BigInt.asIntN(64, t)) : { $numberLong: BigInt.asIntN(64, t).toString() };
    if (t instanceof RegExp || y(t)) {
      let n2 = t.flags;
      if (void 0 === n2) {
        const e2 = t.toString().match(/[gimuy]*$/);
        e2 && (n2 = e2[0]);
      }
      return new se(t.source, n2).toExtendedJSON(e);
    }
    return null != t && "object" == typeof t ? (function(t2, e2) {
      if (null == t2 || "object" != typeof t2) throw new q("not an object instance");
      const n2 = t2._bsontype;
      if (void 0 === n2) {
        const n3 = {};
        for (const i2 of Object.keys(t2)) {
          e2.seenObjects.push({ propertyName: i2, obj: null });
          try {
            const l2 = Me(t2[i2], e2);
            "__proto__" === i2 ? Object.defineProperty(n3, i2, { value: l2, writable: true, enumerable: true, configurable: true }) : n3[i2] = l2;
          } finally {
            e2.seenObjects.pop();
          }
        }
        return n3;
      }
      if (null != t2 && "object" == typeof t2 && "string" == typeof t2._bsontype && t2[f] !== W) throw new tt();
      if ((function(t3) {
        return null != t3 && "object" == typeof t3 && "_bsontype" in t3 && "string" == typeof t3._bsontype;
      })(t2)) {
        let i2 = t2;
        if ("function" != typeof i2.toExtendedJSON) {
          const e3 = Pe[t2._bsontype];
          if (!e3) throw new q("Unrecognized or invalid _bsontype: " + t2._bsontype);
          i2 = e3(i2);
        }
        return "Code" === n2 && i2.scope ? i2 = new St(i2.code, Me(i2.scope, e2)) : "DBRef" === n2 && i2.oid && (i2 = new Kt(Me(i2.collection, e2), Me(i2.oid, e2), Me(i2.db, e2), Me(i2.fields, e2))), i2.toExtendedJSON(e2);
      }
      throw new q("_bsontype must be a string, but was: " + typeof n2);
    })(t, e) : t;
  }
  var Pe = { Binary: (t) => new ft(t.value(), t.sub_type), Code: (t) => new St(t.code, t.scope), DBRef: (t) => new Kt(t.collection || t.namespace, t.oid, t.db, t.fields), Decimal128: (t) => new At(t.bytes), Double: (t) => new $t(t.value), Int32: (t) => new qt(t.value), Long: (t) => Ht.fromBits(null != t.low ? t.low : t.low_, null != t.low ? t.high : t.high_, null != t.low ? t.unsigned : t.unsigned_), MaxKey: () => new te(), MinKey: () => new ee(), ObjectId: (t) => new le(t), BSONRegExp: (t) => new se(t.pattern, t.options), BSONSymbol: (t) => new ae(t.value), Timestamp: (t) => be.fromBits(t.low, t.high) };
  function Fe(t, e) {
    const n2 = { useBigInt64: e?.useBigInt64 ?? false, relaxed: e?.relaxed ?? true, legacy: e?.legacy ?? false };
    return JSON.parse(t, ((t2, e2) => {
      if (-1 !== t2.indexOf("\0")) throw new q(`BSON Document field names cannot contain null bytes, found: ${JSON.stringify(t2)}`);
      return ve(e2, n2);
    }));
  }
  function Qe(t, e, n2, i2) {
    null != n2 && "object" == typeof n2 && (i2 = n2, n2 = 0), null == e || "object" != typeof e || Array.isArray(e) || (i2 = e, e = void 0, n2 = 0);
    const l2 = Me(t, Object.assign({ relaxed: true, legacy: false }, i2, { seenObjects: [{ propertyName: "(root)", obj: null }] }));
    return JSON.stringify(l2, e, n2);
  }
  var Oe = /* @__PURE__ */ Object.create(null);
  Oe.parse = Fe, Oe.stringify = Qe, Oe.serialize = function(t, e) {
    return e = e || {}, JSON.parse(Qe(t, e));
  }, Oe.deserialize = function(t, e) {
    return e = e || {}, Fe(JSON.stringify(t), e);
  }, Object.freeze(Oe);
  var Ee = 1;
  var _e = 2;
  var De = 3;
  var Ae = 4;
  var $e = 5;
  var qe = 6;
  var tn = 7;
  var en = 8;
  var nn = 9;
  var ln = 10;
  var on = 11;
  var cn = 12;
  var sn = 13;
  var an = 14;
  var dn = 15;
  var bn = 16;
  var Zn = 17;
  var mn = 18;
  var un = 19;
  var rn = 255;
  var hn = 127;
  function pn(t, e) {
    try {
      return Wt.getNonnegativeInt32LE(t, e);
    } catch (t2) {
      throw new nt("BSON size cannot be negative", e, { cause: t2 });
    }
  }
  function yn(t, e) {
    let n2 = e;
    for (; 0 !== t[n2]; n2++) ;
    if (n2 === t.length - 1) throw new nt("Null terminator not found", e);
    return n2;
  }
  var Xn = /* @__PURE__ */ Object.create(null);
  Xn.parseToElements = function(t, e = 0) {
    if (e ??= 0, t.length < 5) throw new nt(`Input must be at least 5 bytes, got ${t.length} bytes`, e);
    const n2 = pn(t, e);
    if (n2 > t.length - e) throw new nt(`Parsed documentSize (${n2} bytes) does not match input length (${t.length} bytes)`, e);
    if (0 !== t[e + n2 - 1]) throw new nt("BSON documents must end in 0x00", e + n2);
    const i2 = [];
    let l2 = e + 4;
    for (; l2 <= n2 + e; ) {
      const o = t[l2];
      if (l2 += 1, 0 === o) {
        if (l2 - e !== n2) throw new nt("Invalid 0x00 type byte", l2);
        break;
      }
      const c = l2, s = yn(t, l2) - c;
      let a;
      if (l2 += s + 1, o === Ee || o === mn || o === nn || o === Zn) a = 8;
      else if (o === bn) a = 4;
      else if (o === tn) a = 12;
      else if (o === un) a = 16;
      else if (o === en) a = 1;
      else if (o === ln || o === qe || o === hn || o === rn) a = 0;
      else if (o === on) a = yn(t, yn(t, l2) + 1) + 1 - l2;
      else if (o === De || o === Ae || o === dn) a = pn(t, l2);
      else {
        if (o !== _e && o !== $e && o !== cn && o !== sn && o !== an) throw new nt(`Invalid 0x${o.toString(16).padStart(2, "0")} type byte`, l2);
        a = pn(t, l2) + 4, o === $e && (a += 1), o === cn && (a += 12);
      }
      if (a > n2) throw new nt("value reports length larger than document", l2);
      i2.push([o, c, s, l2, a]), l2 += a;
    }
    return i2;
  }, Xn.ByteUtils = ht, Xn.NumberUtils = Wt, Object.freeze(Xn);
  var Gn = 17825792;
  var Vn = ht.allocate(Gn);
  var Wn = Object.freeze({ __proto__: null, BSONError: q, BSONOffsetError: nt, BSONRegExp: se, BSONRuntimeError: et, BSONSymbol: ae, BSONType: $, BSONValue: yt, BSONVersionError: tt, Binary: ft, ByteUtils: ht, Code: St, DBRef: Kt, Decimal128: At, Double: $t, EJSON: Oe, Int32: qt, Long: Ht, MaxKey: te, MinKey: ee, NumberUtils: Wt, ObjectId: le, Timestamp: be, UUID: Rt, bsonType: pt, calculateObjectSize: function(t, e = {}) {
    return oe(t, "boolean" == typeof (e = e || {}).serializeFunctions && e.serializeFunctions, "boolean" != typeof e.ignoreUndefined || e.ignoreUndefined);
  }, deserialize: function(t, e = {}) {
    return ue(ht.toLocalBufferType(t), e);
  }, deserializeStream: function(t, e, n2, i2, l2, o) {
    const c = Object.assign({ allowObjectSmallerThanBufferSize: true, index: 0 }, o), s = ht.toLocalBufferType(t);
    let a = e;
    for (let t2 = 0; t2 < n2; t2++) {
      const e2 = Wt.getInt32LE(s, a);
      c.index = a, i2[l2 + t2] = ue(s, c), a += e2;
    }
    return a;
  }, onDemand: Xn, serialize: function(t, e = {}) {
    const n2 = "boolean" == typeof e.checkKeys && e.checkKeys, i2 = "boolean" == typeof e.serializeFunctions && e.serializeFunctions, l2 = "boolean" != typeof e.ignoreUndefined || e.ignoreUndefined, o = "number" == typeof e.minInternalBufferSize ? e.minInternalBufferSize : Gn;
    Vn.length < o && (Vn = ht.allocate(o));
    const c = Be(Vn, t, n2, 0, 0, i2, l2, null), s = ht.allocateUnsafe(c);
    return s.set(Vn.subarray(0, c), 0), s;
  }, serializeWithBufferAndIndex: function(t, e, n2 = {}) {
    const i2 = "boolean" == typeof n2.checkKeys && n2.checkKeys, l2 = "boolean" == typeof n2.serializeFunctions && n2.serializeFunctions, o = "boolean" != typeof n2.ignoreUndefined || n2.ignoreUndefined, c = "number" == typeof n2.index ? n2.index : 0, s = Be(Vn, t, i2, 0, 0, l2, o, null);
    return e.set(Vn.subarray(0, s), c), c + s - 1;
  }, setInternalBufferSize: function(t) {
    Vn.length < t && (Vn = ht.allocate(t));
  } });
  function fn(t) {
    return !!t && "object" == typeof t && "buffer" in t && t.buffer instanceof ArrayBuffer && "number" == typeof t.byteOffset && "number" == typeof t.byteLength;
  }
  var In = class {
    constructor() {
    }
    static urlConstructFrom(t) {
      const e = "/ws/modeling/commands" + l({ video_res_width: t.video_res_width, video_res_height: t.video_res_height, fps: t.fps, unlocked_framerate: t.unlocked_framerate, post_effect: t.post_effect, webrtc: t.webrtc, pool: t.pool, show_grid: t.show_grid, replay: t.replay, api_call_id: t.api_call_id, order_independent_transparency: t.order_independent_transparency, pr: t.pr }), n2 = ((t.client?.baseUrl || "https://api.zoo.dev") + e).replace(/^http/, "ws");
      return new URL(n2);
    }
    static authenticate(t, e) {
      const n2 = t.client && t.client.token || "";
      if (n2) try {
        const t2 = { type: "headers", headers: { Authorization: `Bearer ${n2}` } };
        e.send(JSON.stringify(t2));
      } catch {
      }
    }
    static toBSON(t) {
      return Wn.serialize(t);
    }
    static parseMessage(t) {
      const e = t?.data;
      if ("string" == typeof e) return JSON.parse(e);
      if ("undefined" != typeof Buffer && Buffer.isBuffer?.(e)) {
        const t2 = e;
        try {
          return JSON.parse(t2.toString("utf8"));
        } catch {
        }
        return Wn.deserialize(t2);
      }
      if (e instanceof ArrayBuffer) {
        const t2 = new Uint8Array(e);
        try {
          const e2 = new TextDecoder().decode(t2);
          return JSON.parse(e2);
        } catch {
        }
        return Wn.deserialize(t2);
      }
      if (fn(e)) {
        const t2 = new Uint8Array(e.buffer, e.byteOffset, e.byteLength);
        try {
          const e2 = new TextDecoder().decode(t2);
          return JSON.parse(e2);
        } catch {
        }
        return Wn.deserialize(t2);
      }
      return e;
    }
  };
  var Bn = null;
  try {
    Cn = "undefined" != typeof module && "function" == typeof module.require && module.require("worker_threads") || "function" == typeof __non_webpack_require__ && __non_webpack_require__("worker_threads") || "function" == typeof __require && __require("worker_threads");
    Bn = Cn.Worker;
  } catch (t) {
  }
  var Cn;
  function vn(t, e, n2) {
    var i2 = void 0 === e ? null : e, l2 = (function(t2, e2) {
      return Buffer.from(t2, "base64").toString(e2 ? "utf16" : "utf8");
    })(t, void 0 !== n2 && n2), o = l2.indexOf("\n", 10) + 1, c = l2.substring(o) + (i2 ? "//# sourceMappingURL=" + i2 : "");
    return function(t2) {
      return new Bn(c, Object.assign({}, t2, { eval: true }));
    };
  }
  function jn(t, e, n2) {
    var i2 = void 0 === e ? null : e, l2 = (function(t2, e2) {
      var n3 = atob(t2);
      if (e2) {
        for (var i3 = new Uint8Array(n3.length), l3 = 0, o2 = n3.length; l3 < o2; ++l3) i3[l3] = n3.charCodeAt(l3);
        return new TextDecoder("utf-16le").decode(new Uint16Array(i3.buffer));
      }
      return n3;
    })(t, void 0 !== n2 && n2), o = l2.indexOf("\n", 10) + 1, c = l2.substring(o) + (i2 ? "//# sourceMappingURL=" + i2 : ""), s = new Blob([c], { type: "application/javascript" });
    return URL.createObjectURL(s);
  }
  var Mn = "[object process]" === Object.prototype.toString.call("undefined" != typeof process ? process : 0);
  function Pn(t, e, n2) {
    return Mn ? vn(t, e, n2) : /* @__PURE__ */ (function(t2, e2, n3) {
      var i2;
      return function(l2) {
        return i2 = i2 || jn(t2, e2, n3), new Worker(i2, l2);
      };
    })(t, e, n2);
  }
  var Fn = Pn("Lyogcm9sbHVwLXBsdWdpbi13ZWItd29ya2VyLWxvYWRlciAqLwohZnVuY3Rpb24oKXsidXNlIHN0cmljdCI7Y29uc3QgZT1uZXcgVGV4dEVuY29kZXI7ZnVuY3Rpb24gdCh0LG4scil7dC5sZW5ndGg+NTA/ZnVuY3Rpb24odCxuLHIpe2UuZW5jb2RlSW50byh0LG4uc3ViYXJyYXkocikpfSh0LG4scik6ZnVuY3Rpb24oZSx0LG4pe2NvbnN0IHI9ZS5sZW5ndGg7bGV0IGk9bixvPTA7Zm9yKDtvPHI7KXtsZXQgbj1lLmNoYXJDb2RlQXQobysrKTtpZig0Mjk0OTY3MTY4Jm4pe2lmKDQyOTQ5NjUyNDgmbil7aWYobj49NTUyOTYmJm48PTU2MzE5JiZvPHIpe2NvbnN0IHQ9ZS5jaGFyQ29kZUF0KG8pOzU2MzIwPT0oNjQ1MTImdCkmJigrK28sbj0oKDEwMjMmbik8PDEwKSsoMTAyMyZ0KSs2NTUzNil9NDI5NDkwMTc2MCZuPyh0W2krK109bj4+MTgmN3wyNDAsdFtpKytdPW4+PjEyJjYzfDEyOCx0W2krK109bj4+NiY2M3wxMjgpOih0W2krK109bj4+MTImMTV8MjI0LHRbaSsrXT1uPj42JjYzfDEyOCl9ZWxzZSB0W2krK109bj4+NiYzMXwxOTI7dFtpKytdPTYzJm58MTI4fWVsc2UgdFtpKytdPW59fSh0LG4scil9bmV3IFRleHREZWNvZGVyO2NsYXNzIG57dHlwZTtkYXRhO2NvbnN0cnVjdG9yKGUsdCl7dGhpcy50eXBlPWUsdGhpcy5kYXRhPXR9fWNsYXNzIHIgZXh0ZW5kcyBFcnJvcntjb25zdHJ1Y3RvcihlKXtzdXBlcihlKTtjb25zdCB0PU9iamVjdC5jcmVhdGUoci5wcm90b3R5cGUpO09iamVjdC5zZXRQcm90b3R5cGVPZih0aGlzLHQpLE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCJuYW1lIix7Y29uZmlndXJhYmxlOiEwLGVudW1lcmFibGU6ITEsdmFsdWU6ci5uYW1lfSl9fWZ1bmN0aW9uIGkoZSx0LG4pe2NvbnN0IHI9TWF0aC5mbG9vcihuLzQyOTQ5NjcyOTYpLGk9bjtlLnNldFVpbnQzMih0LHIpLGUuc2V0VWludDMyKHQrNCxpKX1jb25zdCBvPTQyOTQ5NjcyOTUscz0xNzE3OTg2OTE4Mztjb25zdCBhPXt0eXBlOi0xLGVuY29kZTpmdW5jdGlvbihlKXtpZihlIGluc3RhbmNlb2YgRGF0ZSl7cmV0dXJuIGZ1bmN0aW9uKHtzZWM6ZSxuc2VjOnR9KXtpZihlPj0wJiZ0Pj0wJiZlPD1zKXtpZigwPT09dCYmZTw9byl7Y29uc3QgdD1uZXcgVWludDhBcnJheSg0KTtyZXR1cm4gbmV3IERhdGFWaWV3KHQuYnVmZmVyKS5zZXRVaW50MzIoMCxlKSx0fXtjb25zdCBuPWUvNDI5NDk2NzI5NixyPTQyOTQ5NjcyOTUmZSxpPW5ldyBVaW50OEFycmF5KDgpLG89bmV3IERhdGFWaWV3KGkuYnVmZmVyKTtyZXR1cm4gby5zZXRVaW50MzIoMCx0PDwyfDMmbiksby5zZXRVaW50MzIoNCxyKSxpfX17Y29uc3Qgbj1uZXcgVWludDhBcnJheSgxMikscj1uZXcgRGF0YVZpZXcobi5idWZmZXIpO3JldHVybiByLnNldFVpbnQzMigwLHQpLGkociw0LGUpLG59fShmdW5jdGlvbihlKXtjb25zdCB0PWUuZ2V0VGltZSgpLG49TWF0aC5mbG9vcih0LzFlMykscj0xZTYqKHQtMWUzKm4pLGk9TWF0aC5mbG9vcihyLzFlOSk7cmV0dXJue3NlYzpuK2ksbnNlYzpyLTFlOSppfX0oZSkpfXJldHVybiBudWxsfSxkZWNvZGU6ZnVuY3Rpb24oZSl7Y29uc3QgdD1mdW5jdGlvbihlKXtjb25zdCB0PW5ldyBEYXRhVmlldyhlLmJ1ZmZlcixlLmJ5dGVPZmZzZXQsZS5ieXRlTGVuZ3RoKTtzd2l0Y2goZS5ieXRlTGVuZ3RoKXtjYXNlIDQ6cmV0dXJue3NlYzp0LmdldFVpbnQzMigwKSxuc2VjOjB9O2Nhc2UgODp7Y29uc3QgZT10LmdldFVpbnQzMigwKTtyZXR1cm57c2VjOjQyOTQ5NjcyOTYqKDMmZSkrdC5nZXRVaW50MzIoNCksbnNlYzplPj4+Mn19Y2FzZSAxMjp7Y29uc3QgZT1mdW5jdGlvbihlLHQpe3JldHVybiA0Mjk0OTY3Mjk2KmUuZ2V0SW50MzIodCkrZS5nZXRVaW50MzIodCs0KX0odCw0KTtyZXR1cm57c2VjOmUsbnNlYzp0LmdldFVpbnQzMigwKX19ZGVmYXVsdDp0aHJvdyBuZXcgcihgVW5yZWNvZ25pemVkIGRhdGEgc2l6ZSBmb3IgdGltZXN0YW1wIChleHBlY3RlZCA0LCA4LCBvciAxMik6ICR7ZS5sZW5ndGh9YCl9fShlKTtyZXR1cm4gbmV3IERhdGUoMWUzKnQuc2VjK3QubnNlYy8xZTYpfX07Y2xhc3MgY3tzdGF0aWMgZGVmYXVsdENvZGVjPW5ldyBjO19fYnJhbmQ7YnVpbHRJbkVuY29kZXJzPVtdO2J1aWx0SW5EZWNvZGVycz1bXTtlbmNvZGVycz1bXTtkZWNvZGVycz1bXTtjb25zdHJ1Y3Rvcigpe3RoaXMucmVnaXN0ZXIoYSl9cmVnaXN0ZXIoe3R5cGU6ZSxlbmNvZGU6dCxkZWNvZGU6bn0pe2lmKGU+PTApdGhpcy5lbmNvZGVyc1tlXT10LHRoaXMuZGVjb2RlcnNbZV09bjtlbHNle2NvbnN0IHI9LTEtZTt0aGlzLmJ1aWx0SW5FbmNvZGVyc1tyXT10LHRoaXMuYnVpbHRJbkRlY29kZXJzW3JdPW59fXRyeVRvRW5jb2RlKGUsdCl7Zm9yKGxldCByPTA7cjx0aGlzLmJ1aWx0SW5FbmNvZGVycy5sZW5ndGg7cisrKXtjb25zdCBpPXRoaXMuYnVpbHRJbkVuY29kZXJzW3JdO2lmKG51bGwhPWkpe2NvbnN0IG89aShlLHQpO2lmKG51bGwhPW8pe3JldHVybiBuZXcgbigtMS1yLG8pfX19Zm9yKGxldCByPTA7cjx0aGlzLmVuY29kZXJzLmxlbmd0aDtyKyspe2NvbnN0IGk9dGhpcy5lbmNvZGVyc1tyXTtpZihudWxsIT1pKXtjb25zdCBvPWkoZSx0KTtpZihudWxsIT1vKXtyZXR1cm4gbmV3IG4ocixvKX19fXJldHVybiBlIGluc3RhbmNlb2Ygbj9lOm51bGx9ZGVjb2RlKGUsdCxyKXtjb25zdCBpPXQ8MD90aGlzLmJ1aWx0SW5EZWNvZGVyc1stMS10XTp0aGlzLmRlY29kZXJzW3RdO3JldHVybiBpP2koZSx0LHIpOm5ldyBuKHQsZSl9fWZ1bmN0aW9uIGwoZSl7cmV0dXJuIGUgaW5zdGFuY2VvZiBVaW50OEFycmF5P2U6QXJyYXlCdWZmZXIuaXNWaWV3KGUpP25ldyBVaW50OEFycmF5KGUuYnVmZmVyLGUuYnl0ZU9mZnNldCxlLmJ5dGVMZW5ndGgpOmZ1bmN0aW9uKGUpe3JldHVybiBlIGluc3RhbmNlb2YgQXJyYXlCdWZmZXJ8fCJ1bmRlZmluZWQiIT10eXBlb2YgU2hhcmVkQXJyYXlCdWZmZXImJmUgaW5zdGFuY2VvZiBTaGFyZWRBcnJheUJ1ZmZlcn0oZSk/bmV3IFVpbnQ4QXJyYXkoZSk6VWludDhBcnJheS5mcm9tKGUpfWNsYXNzIGZ7ZXh0ZW5zaW9uQ29kZWM7Y29udGV4dDt1c2VCaWdJbnQ2NDttYXhEZXB0aDtpbml0aWFsQnVmZmVyU2l6ZTtzb3J0S2V5cztmb3JjZUZsb2F0MzI7aWdub3JlVW5kZWZpbmVkO2ZvcmNlSW50ZWdlclRvRmxvYXQ7cG9zO3ZpZXc7Ynl0ZXM7ZW50ZXJlZD0hMTtjb25zdHJ1Y3RvcihlKXt0aGlzLmV4dGVuc2lvbkNvZGVjPWU/LmV4dGVuc2lvbkNvZGVjPz9jLmRlZmF1bHRDb2RlYyx0aGlzLmNvbnRleHQ9ZT8uY29udGV4dCx0aGlzLnVzZUJpZ0ludDY0PWU/LnVzZUJpZ0ludDY0Pz8hMSx0aGlzLm1heERlcHRoPWU/Lm1heERlcHRoPz8xMDAsdGhpcy5pbml0aWFsQnVmZmVyU2l6ZT1lPy5pbml0aWFsQnVmZmVyU2l6ZT8/MjA0OCx0aGlzLnNvcnRLZXlzPWU/LnNvcnRLZXlzPz8hMSx0aGlzLmZvcmNlRmxvYXQzMj1lPy5mb3JjZUZsb2F0MzI/PyExLHRoaXMuaWdub3JlVW5kZWZpbmVkPWU/Lmlnbm9yZVVuZGVmaW5lZD8/ITEsdGhpcy5mb3JjZUludGVnZXJUb0Zsb2F0PWU/LmZvcmNlSW50ZWdlclRvRmxvYXQ/PyExLHRoaXMucG9zPTAsdGhpcy52aWV3PW5ldyBEYXRhVmlldyhuZXcgQXJyYXlCdWZmZXIodGhpcy5pbml0aWFsQnVmZmVyU2l6ZSkpLHRoaXMuYnl0ZXM9bmV3IFVpbnQ4QXJyYXkodGhpcy52aWV3LmJ1ZmZlcil9Y2xvbmUoKXtyZXR1cm4gbmV3IGYoe2V4dGVuc2lvbkNvZGVjOnRoaXMuZXh0ZW5zaW9uQ29kZWMsY29udGV4dDp0aGlzLmNvbnRleHQsdXNlQmlnSW50NjQ6dGhpcy51c2VCaWdJbnQ2NCxtYXhEZXB0aDp0aGlzLm1heERlcHRoLGluaXRpYWxCdWZmZXJTaXplOnRoaXMuaW5pdGlhbEJ1ZmZlclNpemUsc29ydEtleXM6dGhpcy5zb3J0S2V5cyxmb3JjZUZsb2F0MzI6dGhpcy5mb3JjZUZsb2F0MzIsaWdub3JlVW5kZWZpbmVkOnRoaXMuaWdub3JlVW5kZWZpbmVkLGZvcmNlSW50ZWdlclRvRmxvYXQ6dGhpcy5mb3JjZUludGVnZXJUb0Zsb2F0fSl9cmVpbml0aWFsaXplU3RhdGUoKXt0aGlzLnBvcz0wfWVuY29kZVNoYXJlZFJlZihlKXtpZih0aGlzLmVudGVyZWQpe3JldHVybiB0aGlzLmNsb25lKCkuZW5jb2RlU2hhcmVkUmVmKGUpfXRyeXtyZXR1cm4gdGhpcy5lbnRlcmVkPSEwLHRoaXMucmVpbml0aWFsaXplU3RhdGUoKSx0aGlzLmRvRW5jb2RlKGUsMSksdGhpcy5ieXRlcy5zdWJhcnJheSgwLHRoaXMucG9zKX1maW5hbGx5e3RoaXMuZW50ZXJlZD0hMX19ZW5jb2RlKGUpe2lmKHRoaXMuZW50ZXJlZCl7cmV0dXJuIHRoaXMuY2xvbmUoKS5lbmNvZGUoZSl9dHJ5e3JldHVybiB0aGlzLmVudGVyZWQ9ITAsdGhpcy5yZWluaXRpYWxpemVTdGF0ZSgpLHRoaXMuZG9FbmNvZGUoZSwxKSx0aGlzLmJ5dGVzLnNsaWNlKDAsdGhpcy5wb3MpfWZpbmFsbHl7dGhpcy5lbnRlcmVkPSExfX1kb0VuY29kZShlLHQpe2lmKHQ+dGhpcy5tYXhEZXB0aCl0aHJvdyBuZXcgRXJyb3IoYFRvbyBkZWVwIG9iamVjdHMgaW4gZGVwdGggJHt0fWApO251bGw9PWU/dGhpcy5lbmNvZGVOaWwoKToiYm9vbGVhbiI9PXR5cGVvZiBlP3RoaXMuZW5jb2RlQm9vbGVhbihlKToibnVtYmVyIj09dHlwZW9mIGU/dGhpcy5mb3JjZUludGVnZXJUb0Zsb2F0P3RoaXMuZW5jb2RlTnVtYmVyQXNGbG9hdChlKTp0aGlzLmVuY29kZU51bWJlcihlKToic3RyaW5nIj09dHlwZW9mIGU/dGhpcy5lbmNvZGVTdHJpbmcoZSk6dGhpcy51c2VCaWdJbnQ2NCYmImJpZ2ludCI9PXR5cGVvZiBlP3RoaXMuZW5jb2RlQmlnSW50NjQoZSk6dGhpcy5lbmNvZGVPYmplY3QoZSx0KX1lbnN1cmVCdWZmZXJTaXplVG9Xcml0ZShlKXtjb25zdCB0PXRoaXMucG9zK2U7dGhpcy52aWV3LmJ5dGVMZW5ndGg8dCYmdGhpcy5yZXNpemVCdWZmZXIoMip0KX1yZXNpemVCdWZmZXIoZSl7Y29uc3QgdD1uZXcgQXJyYXlCdWZmZXIoZSksbj1uZXcgVWludDhBcnJheSh0KSxyPW5ldyBEYXRhVmlldyh0KTtuLnNldCh0aGlzLmJ5dGVzKSx0aGlzLnZpZXc9cix0aGlzLmJ5dGVzPW59ZW5jb2RlTmlsKCl7dGhpcy53cml0ZVU4KDE5Mil9ZW5jb2RlQm9vbGVhbihlKXshMT09PWU/dGhpcy53cml0ZVU4KDE5NCk6dGhpcy53cml0ZVU4KDE5NSl9ZW5jb2RlTnVtYmVyKGUpeyF0aGlzLmZvcmNlSW50ZWdlclRvRmxvYXQmJk51bWJlci5pc1NhZmVJbnRlZ2VyKGUpP2U+PTA/ZTwxMjg/dGhpcy53cml0ZVU4KGUpOmU8MjU2Pyh0aGlzLndyaXRlVTgoMjA0KSx0aGlzLndyaXRlVTgoZSkpOmU8NjU1MzY/KHRoaXMud3JpdGVVOCgyMDUpLHRoaXMud3JpdGVVMTYoZSkpOmU8NDI5NDk2NzI5Nj8odGhpcy53cml0ZVU4KDIwNiksdGhpcy53cml0ZVUzMihlKSk6dGhpcy51c2VCaWdJbnQ2ND90aGlzLmVuY29kZU51bWJlckFzRmxvYXQoZSk6KHRoaXMud3JpdGVVOCgyMDcpLHRoaXMud3JpdGVVNjQoZSkpOmU+PS0zMj90aGlzLndyaXRlVTgoMjI0fGUrMzIpOmU+PS0xMjg/KHRoaXMud3JpdGVVOCgyMDgpLHRoaXMud3JpdGVJOChlKSk6ZT49LTMyNzY4Pyh0aGlzLndyaXRlVTgoMjA5KSx0aGlzLndyaXRlSTE2KGUpKTplPj0tMjE0NzQ4MzY0OD8odGhpcy53cml0ZVU4KDIxMCksdGhpcy53cml0ZUkzMihlKSk6dGhpcy51c2VCaWdJbnQ2ND90aGlzLmVuY29kZU51bWJlckFzRmxvYXQoZSk6KHRoaXMud3JpdGVVOCgyMTEpLHRoaXMud3JpdGVJNjQoZSkpOnRoaXMuZW5jb2RlTnVtYmVyQXNGbG9hdChlKX1lbmNvZGVOdW1iZXJBc0Zsb2F0KGUpe3RoaXMuZm9yY2VGbG9hdDMyPyh0aGlzLndyaXRlVTgoMjAyKSx0aGlzLndyaXRlRjMyKGUpKToodGhpcy53cml0ZVU4KDIwMyksdGhpcy53cml0ZUY2NChlKSl9ZW5jb2RlQmlnSW50NjQoZSl7ZT49QmlnSW50KDApPyh0aGlzLndyaXRlVTgoMjA3KSx0aGlzLndyaXRlQmlnVWludDY0KGUpKToodGhpcy53cml0ZVU4KDIxMSksdGhpcy53cml0ZUJpZ0ludDY0KGUpKX13cml0ZVN0cmluZ0hlYWRlcihlKXtpZihlPDMyKXRoaXMud3JpdGVVOCgxNjArZSk7ZWxzZSBpZihlPDI1Nil0aGlzLndyaXRlVTgoMjE3KSx0aGlzLndyaXRlVTgoZSk7ZWxzZSBpZihlPDY1NTM2KXRoaXMud3JpdGVVOCgyMTgpLHRoaXMud3JpdGVVMTYoZSk7ZWxzZXtpZighKGU8NDI5NDk2NzI5NikpdGhyb3cgbmV3IEVycm9yKGBUb28gbG9uZyBzdHJpbmc6ICR7ZX0gYnl0ZXMgaW4gVVRGLThgKTt0aGlzLndyaXRlVTgoMjE5KSx0aGlzLndyaXRlVTMyKGUpfX1lbmNvZGVTdHJpbmcoZSl7Y29uc3Qgbj1mdW5jdGlvbihlKXtjb25zdCB0PWUubGVuZ3RoO2xldCBuPTAscj0wO2Zvcig7cjx0Oyl7bGV0IGk9ZS5jaGFyQ29kZUF0KHIrKyk7aWYoNDI5NDk2NzE2OCZpKWlmKDQyOTQ5NjUyNDgmaSl7aWYoaT49NTUyOTYmJmk8PTU2MzE5JiZyPHQpe2NvbnN0IHQ9ZS5jaGFyQ29kZUF0KHIpOzU2MzIwPT0oNjQ1MTImdCkmJigrK3IsaT0oKDEwMjMmaSk8PDEwKSsoMTAyMyZ0KSs2NTUzNil9bis9NDI5NDkwMTc2MCZpPzQ6M31lbHNlIG4rPTI7ZWxzZSBuKyt9cmV0dXJuIG59KGUpO3RoaXMuZW5zdXJlQnVmZmVyU2l6ZVRvV3JpdGUoNStuKSx0aGlzLndyaXRlU3RyaW5nSGVhZGVyKG4pLHQoZSx0aGlzLmJ5dGVzLHRoaXMucG9zKSx0aGlzLnBvcys9bn1lbmNvZGVPYmplY3QoZSx0KXtjb25zdCBuPXRoaXMuZXh0ZW5zaW9uQ29kZWMudHJ5VG9FbmNvZGUoZSx0aGlzLmNvbnRleHQpO2lmKG51bGwhPW4pdGhpcy5lbmNvZGVFeHRlbnNpb24obik7ZWxzZSBpZihBcnJheS5pc0FycmF5KGUpKXRoaXMuZW5jb2RlQXJyYXkoZSx0KTtlbHNlIGlmKEFycmF5QnVmZmVyLmlzVmlldyhlKSl0aGlzLmVuY29kZUJpbmFyeShlKTtlbHNle2lmKCJvYmplY3QiIT10eXBlb2YgZSl0aHJvdyBuZXcgRXJyb3IoYFVucmVjb2duaXplZCBvYmplY3Q6ICR7T2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5hcHBseShlKX1gKTt0aGlzLmVuY29kZU1hcChlLHQpfX1lbmNvZGVCaW5hcnkoZSl7Y29uc3QgdD1lLmJ5dGVMZW5ndGg7aWYodDwyNTYpdGhpcy53cml0ZVU4KDE5NiksdGhpcy53cml0ZVU4KHQpO2Vsc2UgaWYodDw2NTUzNil0aGlzLndyaXRlVTgoMTk3KSx0aGlzLndyaXRlVTE2KHQpO2Vsc2V7aWYoISh0PDQyOTQ5NjcyOTYpKXRocm93IG5ldyBFcnJvcihgVG9vIGxhcmdlIGJpbmFyeTogJHt0fWApO3RoaXMud3JpdGVVOCgxOTgpLHRoaXMud3JpdGVVMzIodCl9Y29uc3Qgbj1sKGUpO3RoaXMud3JpdGVVOGEobil9ZW5jb2RlQXJyYXkoZSx0KXtjb25zdCBuPWUubGVuZ3RoO2lmKG48MTYpdGhpcy53cml0ZVU4KDE0NCtuKTtlbHNlIGlmKG48NjU1MzYpdGhpcy53cml0ZVU4KDIyMCksdGhpcy53cml0ZVUxNihuKTtlbHNle2lmKCEobjw0Mjk0OTY3Mjk2KSl0aHJvdyBuZXcgRXJyb3IoYFRvbyBsYXJnZSBhcnJheTogJHtufWApO3RoaXMud3JpdGVVOCgyMjEpLHRoaXMud3JpdGVVMzIobil9Zm9yKGNvbnN0IG4gb2YgZSl0aGlzLmRvRW5jb2RlKG4sdCsxKX1jb3VudFdpdGhvdXRVbmRlZmluZWQoZSx0KXtsZXQgbj0wO2Zvcihjb25zdCByIG9mIHQpdm9pZCAwIT09ZVtyXSYmbisrO3JldHVybiBufWVuY29kZU1hcChlLHQpe2NvbnN0IG49T2JqZWN0LmtleXMoZSk7dGhpcy5zb3J0S2V5cyYmbi5zb3J0KCk7Y29uc3Qgcj10aGlzLmlnbm9yZVVuZGVmaW5lZD90aGlzLmNvdW50V2l0aG91dFVuZGVmaW5lZChlLG4pOm4ubGVuZ3RoO2lmKHI8MTYpdGhpcy53cml0ZVU4KDEyOCtyKTtlbHNlIGlmKHI8NjU1MzYpdGhpcy53cml0ZVU4KDIyMiksdGhpcy53cml0ZVUxNihyKTtlbHNle2lmKCEocjw0Mjk0OTY3Mjk2KSl0aHJvdyBuZXcgRXJyb3IoYFRvbyBsYXJnZSBtYXAgb2JqZWN0OiAke3J9YCk7dGhpcy53cml0ZVU4KDIyMyksdGhpcy53cml0ZVUzMihyKX1mb3IoY29uc3QgciBvZiBuKXtjb25zdCBuPWVbcl07dGhpcy5pZ25vcmVVbmRlZmluZWQmJnZvaWQgMD09PW58fCh0aGlzLmVuY29kZVN0cmluZyhyKSx0aGlzLmRvRW5jb2RlKG4sdCsxKSl9fWVuY29kZUV4dGVuc2lvbihlKXtpZigiZnVuY3Rpb24iPT10eXBlb2YgZS5kYXRhKXtjb25zdCB0PWUuZGF0YSh0aGlzLnBvcys2KSxuPXQubGVuZ3RoO2lmKG4+PTQyOTQ5NjcyOTYpdGhyb3cgbmV3IEVycm9yKGBUb28gbGFyZ2UgZXh0ZW5zaW9uIG9iamVjdDogJHtufWApO3JldHVybiB0aGlzLndyaXRlVTgoMjAxKSx0aGlzLndyaXRlVTMyKG4pLHRoaXMud3JpdGVJOChlLnR5cGUpLHZvaWQgdGhpcy53cml0ZVU4YSh0KX1jb25zdCB0PWUuZGF0YS5sZW5ndGg7aWYoMT09PXQpdGhpcy53cml0ZVU4KDIxMik7ZWxzZSBpZigyPT09dCl0aGlzLndyaXRlVTgoMjEzKTtlbHNlIGlmKDQ9PT10KXRoaXMud3JpdGVVOCgyMTQpO2Vsc2UgaWYoOD09PXQpdGhpcy53cml0ZVU4KDIxNSk7ZWxzZSBpZigxNj09PXQpdGhpcy53cml0ZVU4KDIxNik7ZWxzZSBpZih0PDI1Nil0aGlzLndyaXRlVTgoMTk5KSx0aGlzLndyaXRlVTgodCk7ZWxzZSBpZih0PDY1NTM2KXRoaXMud3JpdGVVOCgyMDApLHRoaXMud3JpdGVVMTYodCk7ZWxzZXtpZighKHQ8NDI5NDk2NzI5NikpdGhyb3cgbmV3IEVycm9yKGBUb28gbGFyZ2UgZXh0ZW5zaW9uIG9iamVjdDogJHt0fWApO3RoaXMud3JpdGVVOCgyMDEpLHRoaXMud3JpdGVVMzIodCl9dGhpcy53cml0ZUk4KGUudHlwZSksdGhpcy53cml0ZVU4YShlLmRhdGEpfXdyaXRlVTgoZSl7dGhpcy5lbnN1cmVCdWZmZXJTaXplVG9Xcml0ZSgxKSx0aGlzLnZpZXcuc2V0VWludDgodGhpcy5wb3MsZSksdGhpcy5wb3MrK313cml0ZVU4YShlKXtjb25zdCB0PWUubGVuZ3RoO3RoaXMuZW5zdXJlQnVmZmVyU2l6ZVRvV3JpdGUodCksdGhpcy5ieXRlcy5zZXQoZSx0aGlzLnBvcyksdGhpcy5wb3MrPXR9d3JpdGVJOChlKXt0aGlzLmVuc3VyZUJ1ZmZlclNpemVUb1dyaXRlKDEpLHRoaXMudmlldy5zZXRJbnQ4KHRoaXMucG9zLGUpLHRoaXMucG9zKyt9d3JpdGVVMTYoZSl7dGhpcy5lbnN1cmVCdWZmZXJTaXplVG9Xcml0ZSgyKSx0aGlzLnZpZXcuc2V0VWludDE2KHRoaXMucG9zLGUpLHRoaXMucG9zKz0yfXdyaXRlSTE2KGUpe3RoaXMuZW5zdXJlQnVmZmVyU2l6ZVRvV3JpdGUoMiksdGhpcy52aWV3LnNldEludDE2KHRoaXMucG9zLGUpLHRoaXMucG9zKz0yfXdyaXRlVTMyKGUpe3RoaXMuZW5zdXJlQnVmZmVyU2l6ZVRvV3JpdGUoNCksdGhpcy52aWV3LnNldFVpbnQzMih0aGlzLnBvcyxlKSx0aGlzLnBvcys9NH13cml0ZUkzMihlKXt0aGlzLmVuc3VyZUJ1ZmZlclNpemVUb1dyaXRlKDQpLHRoaXMudmlldy5zZXRJbnQzMih0aGlzLnBvcyxlKSx0aGlzLnBvcys9NH13cml0ZUYzMihlKXt0aGlzLmVuc3VyZUJ1ZmZlclNpemVUb1dyaXRlKDQpLHRoaXMudmlldy5zZXRGbG9hdDMyKHRoaXMucG9zLGUpLHRoaXMucG9zKz00fXdyaXRlRjY0KGUpe3RoaXMuZW5zdXJlQnVmZmVyU2l6ZVRvV3JpdGUoOCksdGhpcy52aWV3LnNldEZsb2F0NjQodGhpcy5wb3MsZSksdGhpcy5wb3MrPTh9d3JpdGVVNjQoZSl7dGhpcy5lbnN1cmVCdWZmZXJTaXplVG9Xcml0ZSg4KSxmdW5jdGlvbihlLHQsbil7Y29uc3Qgcj1uLzQyOTQ5NjcyOTYsaT1uO2Uuc2V0VWludDMyKHQsciksZS5zZXRVaW50MzIodCs0LGkpfSh0aGlzLnZpZXcsdGhpcy5wb3MsZSksdGhpcy5wb3MrPTh9d3JpdGVJNjQoZSl7dGhpcy5lbnN1cmVCdWZmZXJTaXplVG9Xcml0ZSg4KSxpKHRoaXMudmlldyx0aGlzLnBvcyxlKSx0aGlzLnBvcys9OH13cml0ZUJpZ1VpbnQ2NChlKXt0aGlzLmVuc3VyZUJ1ZmZlclNpemVUb1dyaXRlKDgpLHRoaXMudmlldy5zZXRCaWdVaW50NjQodGhpcy5wb3MsZSksdGhpcy5wb3MrPTh9d3JpdGVCaWdJbnQ2NChlKXt0aGlzLmVuc3VyZUJ1ZmZlclNpemVUb1dyaXRlKDgpLHRoaXMudmlldy5zZXRCaWdJbnQ2NCh0aGlzLnBvcyxlKSx0aGlzLnBvcys9OH19dHJ5e2lmKCJ1bmRlZmluZWQiPT10eXBlb2YgZmV0Y2gmJiJ1bmRlZmluZWQiIT10eXBlb2YgcHJvY2VzcyYmcHJvY2Vzcy52ZXJzaW9ucz8ubm9kZSl7bmV3IEZ1bmN0aW9uKCJtIiwicmV0dXJuIGltcG9ydChtKSIpKCJjcm9zcy1mZXRjaC9wb2x5ZmlsbCIpLmNhdGNoKCgoKT0+e30pKX19Y2F0Y2h7fXRyeXtpZigidW5kZWZpbmVkIiE9dHlwZW9mIHByb2Nlc3MmJnByb2Nlc3MudmVyc2lvbnM/Lm5vZGUmJiJ3aW4zMiI9PT1wcm9jZXNzLnBsYXRmb3JtKXtuZXcgRnVuY3Rpb24oIm0iLCJyZXR1cm4gaW1wb3J0KG0pIikoIndpbi1jYSIpfX1jYXRjaHt9Y29uc3QgdT0oKCk9Pntjb25zdCBlPU9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoT2JqZWN0LmdldFByb3RvdHlwZU9mKFVpbnQ4QXJyYXkucHJvdG90eXBlKSxTeW1ib2wudG9TdHJpbmdUYWcpLmdldDtyZXR1cm4gdD0+ZS5jYWxsKHQpfSkoKTtmdW5jdGlvbiBfKGUpe3JldHVybiJVaW50OEFycmF5Ij09PXUoZSl9ZnVuY3Rpb24gZyhlKXtyZXR1cm4ib2JqZWN0Ij09dHlwZW9mIGUmJm51bGwhPWUmJlN5bWJvbC50b1N0cmluZ1RhZyBpbiBlJiYoIkFycmF5QnVmZmVyIj09PWVbU3ltYm9sLnRvU3RyaW5nVGFnXXx8IlNoYXJlZEFycmF5QnVmZmVyIj09PWVbU3ltYm9sLnRvU3RyaW5nVGFnXSl9ZnVuY3Rpb24gaChlKXtyZXR1cm4gZSBpbnN0YW5jZW9mIFJlZ0V4cHx8IltvYmplY3QgUmVnRXhwXSI9PT1PYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZSl9ZnVuY3Rpb24gYihlKXtyZXR1cm4ib2JqZWN0Ij09dHlwZW9mIGUmJm51bGwhPWUmJlN5bWJvbC50b1N0cmluZ1RhZyBpbiBlJiYiTWFwIj09PWVbU3ltYm9sLnRvU3RyaW5nVGFnXX1mdW5jdGlvbiBkKGUpe3JldHVybiBlIGluc3RhbmNlb2YgRGF0ZXx8IltvYmplY3QgRGF0ZV0iPT09T2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGUpfWZ1bmN0aW9uIHcoZSx0KXtyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZSwoKGUsdCk9PiJiaWdpbnQiPT10eXBlb2YgdD97JG51bWJlckxvbmc6YCR7dH1gfTpiKHQpP09iamVjdC5mcm9tRW50cmllcyh0KTp0KSl9Y29uc3QgcD03LHk9U3ltYm9sLmZvcigiQEBtZGIuYnNvbi52ZXJzaW9uIiksbT0yMTQ3NDgzNjQ3LFM9LTIxNDc0ODM2NDgsQj1NYXRoLnBvdygyLDYzKS0xLHg9LU1hdGgucG93KDIsNjMpLEU9TWF0aC5wb3coMiw1MyksVT0tTWF0aC5wb3coMiw1MyksTz0xLE49MixJPTMsdj00LFQ9NSwkPTYsTD03LEE9OCxSPTksaj0xMCxGPTExLGs9MTIsej0xMyxEPTE0LEM9MTUsTT0xNixWPTE3LFA9MTgsSj0xOSxXPTI1NSxZPTEyNyxxPTAsSD00LEs9T2JqZWN0LmZyZWV6ZSh7ZG91YmxlOjEsc3RyaW5nOjIsb2JqZWN0OjMsYXJyYXk6NCxiaW5EYXRhOjUsdW5kZWZpbmVkOjYsb2JqZWN0SWQ6Nyxib29sOjgsZGF0ZTo5LG51bGw6MTAscmVnZXg6MTEsZGJQb2ludGVyOjEyLGphdmFzY3JpcHQ6MTMsc3ltYm9sOjE0LGphdmFzY3JpcHRXaXRoU2NvcGU6MTUsaW50OjE2LHRpbWVzdGFtcDoxNyxsb25nOjE4LGRlY2ltYWw6MTksbWluS2V5Oi0xLG1heEtleToxMjd9KTtjbGFzcyBaIGV4dGVuZHMgRXJyb3J7Z2V0IGJzb25FcnJvcigpe3JldHVybiEwfWdldCBuYW1lKCl7cmV0dXJuIkJTT05FcnJvciJ9Y29uc3RydWN0b3IoZSx0KXtzdXBlcihlLHQpfXN0YXRpYyBpc0JTT05FcnJvcihlKXtyZXR1cm4gbnVsbCE9ZSYmIm9iamVjdCI9PXR5cGVvZiBlJiYiYnNvbkVycm9yImluIGUmJiEwPT09ZS5ic29uRXJyb3ImJiJuYW1lImluIGUmJiJtZXNzYWdlImluIGUmJiJzdGFjayJpbiBlfX1jbGFzcyBHIGV4dGVuZHMgWntnZXQgbmFtZSgpe3JldHVybiJCU09OVmVyc2lvbkVycm9yIn1jb25zdHJ1Y3Rvcigpe3N1cGVyKGBVbnN1cHBvcnRlZCBCU09OIHZlcnNpb24sIGJzb24gdHlwZXMgbXVzdCBiZSBmcm9tIGJzb24gJHtwfS54LnhgKX19Y2xhc3MgWCBleHRlbmRzIFp7Z2V0IG5hbWUoKXtyZXR1cm4iQlNPTlJ1bnRpbWVFcnJvciJ9Y29uc3RydWN0b3IoZSl7c3VwZXIoZSl9fWNsYXNzIFEgZXh0ZW5kcyBae2dldCBuYW1lKCl7cmV0dXJuIkJTT05PZmZzZXRFcnJvciJ9b2Zmc2V0O2NvbnN0cnVjdG9yKGUsdCxuKXtzdXBlcihgJHtlfS4gb2Zmc2V0OiAke3R9YCxuKSx0aGlzLm9mZnNldD10fX1sZXQgZWUsdGU7ZnVuY3Rpb24gbmUoZSx0LG4scil7aWYocil7ZWU/Pz1uZXcgVGV4dERlY29kZXIoInV0ZjgiLHtmYXRhbDohMH0pO3RyeXtyZXR1cm4gZWUuZGVjb2RlKGUuc3ViYXJyYXkodCxuKSl9Y2F0Y2goZSl7dGhyb3cgbmV3IFooIkludmFsaWQgVVRGLTggc3RyaW5nIGluIEJTT04gZG9jdW1lbnQiLHtjYXVzZTplfSl9fXJldHVybiB0ZT8/PW5ldyBUZXh0RGVjb2RlcigidXRmOCIse2ZhdGFsOiExfSksdGUuZGVjb2RlKGUuc3ViYXJyYXkodCxuKSl9ZnVuY3Rpb24gcmUoZSx0LG4pe2lmKDA9PT1lLmxlbmd0aClyZXR1cm4iIjtjb25zdCByPW4tdDtpZigwPT09cilyZXR1cm4iIjtpZihyPjIwKXJldHVybiBudWxsO2lmKDE9PT1yJiZlW3RdPDEyOClyZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZShlW3RdKTtpZigyPT09ciYmZVt0XTwxMjgmJmVbdCsxXTwxMjgpcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoZVt0XSkrU3RyaW5nLmZyb21DaGFyQ29kZShlW3QrMV0pO2lmKDM9PT1yJiZlW3RdPDEyOCYmZVt0KzFdPDEyOCYmZVt0KzJdPDEyOClyZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZShlW3RdKStTdHJpbmcuZnJvbUNoYXJDb2RlKGVbdCsxXSkrU3RyaW5nLmZyb21DaGFyQ29kZShlW3QrMl0pO2NvbnN0IGk9W107Zm9yKGxldCByPXQ7cjxuO3IrKyl7Y29uc3QgdD1lW3JdO2lmKHQ+MTI3KXJldHVybiBudWxsO2kucHVzaCh0KX1yZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZSguLi5pKX1mdW5jdGlvbiBpZShlKXtyZXR1cm4gYWUuZnJvbU51bWJlckFycmF5KEFycmF5LmZyb20oe2xlbmd0aDplfSwoKCk9Pk1hdGguZmxvb3IoMjU2Kk1hdGgucmFuZG9tKCkpKSkpfWZ1bmN0aW9uIG9lKGUpe3JldHVybiBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKGFlLmFsbG9jYXRlKGUpKX1jb25zdCBzZT0oKCk9Pntjb25zdHtjcnlwdG86ZX09Z2xvYmFsVGhpcztyZXR1cm4gbnVsbCE9ZSYmImZ1bmN0aW9uIj09dHlwZW9mIGUuZ2V0UmFuZG9tVmFsdWVzP29lOmllfSkoKSxhZT17aXNVaW50OEFycmF5Ol8sdG9Mb2NhbEJ1ZmZlclR5cGUoZSl7aWYoQnVmZmVyLmlzQnVmZmVyKGUpKXJldHVybiBlO2lmKEFycmF5QnVmZmVyLmlzVmlldyhlKSlyZXR1cm4gQnVmZmVyLmZyb20oZS5idWZmZXIsZS5ieXRlT2Zmc2V0LGUuYnl0ZUxlbmd0aCk7Y29uc3QgdD1lPy5bU3ltYm9sLnRvU3RyaW5nVGFnXT8/T2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGUpO2lmKCJBcnJheUJ1ZmZlciI9PT10fHwiU2hhcmVkQXJyYXlCdWZmZXIiPT09dHx8IltvYmplY3QgQXJyYXlCdWZmZXJdIj09PXR8fCJbb2JqZWN0IFNoYXJlZEFycmF5QnVmZmVyXSI9PT10KXJldHVybiBCdWZmZXIuZnJvbShlKTt0aHJvdyBuZXcgWigiQ2Fubm90IGNyZWF0ZSBCdWZmZXIgZnJvbSB0aGUgcGFzc2VkIHBvdGVudGlhbEJ1ZmZlci4iKX0sYWxsb2NhdGU6ZT0+QnVmZmVyLmFsbG9jKGUpLGFsbG9jYXRlVW5zYWZlOmU9PkJ1ZmZlci5hbGxvY1Vuc2FmZShlKSxjb21wYXJlOihlLHQpPT5hZS50b0xvY2FsQnVmZmVyVHlwZShlKS5jb21wYXJlKHQpLGNvbmNhdDplPT5CdWZmZXIuY29uY2F0KGUpLGNvcHk6KGUsdCxuLHIsaSk9PmFlLnRvTG9jYWxCdWZmZXJUeXBlKGUpLmNvcHkodCxuPz8wLHI/PzAsaT8/ZS5sZW5ndGgpLGVxdWFsczooZSx0KT0+YWUudG9Mb2NhbEJ1ZmZlclR5cGUoZSkuZXF1YWxzKHQpLGZyb21OdW1iZXJBcnJheTplPT5CdWZmZXIuZnJvbShlKSxmcm9tQmFzZTY0OmU9PkJ1ZmZlci5mcm9tKGUsImJhc2U2NCIpLGZyb21VVEY4OmU9PkJ1ZmZlci5mcm9tKGUsInV0ZjgiKSx0b0Jhc2U2NDplPT5hZS50b0xvY2FsQnVmZmVyVHlwZShlKS50b1N0cmluZygiYmFzZTY0IiksZnJvbUlTTzg4NTkxOmU9PkJ1ZmZlci5mcm9tKGUsImJpbmFyeSIpLHRvSVNPODg1OTE6ZT0+YWUudG9Mb2NhbEJ1ZmZlclR5cGUoZSkudG9TdHJpbmcoImJpbmFyeSIpLGZyb21IZXg6ZT0+QnVmZmVyLmZyb20oZSwiaGV4IiksdG9IZXg6ZT0+YWUudG9Mb2NhbEJ1ZmZlclR5cGUoZSkudG9TdHJpbmcoImhleCIpLHRvVVRGOChlLHQsbixyKXtjb25zdCBpPW4tdDw9MjA/cmUoZSx0LG4pOm51bGw7aWYobnVsbCE9aSlyZXR1cm4gaTtjb25zdCBvPWFlLnRvTG9jYWxCdWZmZXJUeXBlKGUpLnRvU3RyaW5nKCJ1dGY4Iix0LG4pO2lmKHIpZm9yKGxldCByPTA7cjxvLmxlbmd0aDtyKyspaWYoNjU1MzM9PT1vLmNoYXJDb2RlQXQocikpe25lKGUsdCxuLCEwKTticmVha31yZXR1cm4gb30sdXRmOEJ5dGVMZW5ndGg6ZT0+QnVmZmVyLmJ5dGVMZW5ndGgoZSwidXRmOCIpLGVuY29kZVVURjhJbnRvKGUsdCxuKXtjb25zdCByPWZ1bmN0aW9uKGUsdCxuKXtpZigwPT09dC5sZW5ndGgpcmV0dXJuIDA7aWYodC5sZW5ndGg+MjUpcmV0dXJuIG51bGw7aWYoZS5sZW5ndGgtbjx0Lmxlbmd0aClyZXR1cm4gbnVsbDtmb3IobGV0IHI9MCxpPW47cjx0Lmxlbmd0aDtyKyssaSsrKXtjb25zdCBuPXQuY2hhckNvZGVBdChyKTtpZihuPjEyNylyZXR1cm4gbnVsbDtlW2ldPW59cmV0dXJuIHQubGVuZ3RofShlLHQsbik7cmV0dXJuIG51bGwhPXI/cjphZS50b0xvY2FsQnVmZmVyVHlwZShlKS53cml0ZSh0LG4sdm9pZCAwLCJ1dGY4Iil9LHJhbmRvbUJ5dGVzOnNlLHN3YXAzMjplPT5hZS50b0xvY2FsQnVmZmVyVHlwZShlKS5zd2FwMzIoKX07ZnVuY3Rpb24gY2UoZSl7aWYoZTwwKXRocm93IG5ldyBSYW5nZUVycm9yKGBUaGUgYXJndW1lbnQgJ2J5dGVMZW5ndGgnIGlzIGludmFsaWQuIFJlY2VpdmVkICR7ZX1gKTtyZXR1cm4gdWUuZnJvbU51bWJlckFycmF5KEFycmF5LmZyb20oe2xlbmd0aDplfSwoKCk9Pk1hdGguZmxvb3IoMjU2Kk1hdGgucmFuZG9tKCkpKSkpfWNvbnN0IGxlPSgoKT0+e2NvbnN0e2NyeXB0bzplfT1nbG9iYWxUaGlzO2lmKG51bGwhPWUmJiJmdW5jdGlvbiI9PXR5cGVvZiBlLmdldFJhbmRvbVZhbHVlcylyZXR1cm4gdD0+ZS5nZXRSYW5kb21WYWx1ZXModWUuYWxsb2NhdGUodCkpO2lmKGZ1bmN0aW9uKCl7Y29uc3R7bmF2aWdhdG9yOmV9PWdsb2JhbFRoaXM7cmV0dXJuIm9iamVjdCI9PXR5cGVvZiBlJiYiUmVhY3ROYXRpdmUiPT09ZS5wcm9kdWN0fSgpKXtjb25zdHtjb25zb2xlOmV9PWdsb2JhbFRoaXM7ZT8ud2Fybj8uKCJCU09OOiBGb3IgUmVhY3QgTmF0aXZlIHBsZWFzZSBwb2x5ZmlsbCBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzLCBlLmcuIHVzaW5nOiBodHRwczovL3d3dy5ucG1qcy5jb20vcGFja2FnZS9yZWFjdC1uYXRpdmUtZ2V0LXJhbmRvbS12YWx1ZXMuIil9cmV0dXJuIGNlfSkoKSxmZT0vKFxkfFthLWZdKS9pLHVlPXtpc1VpbnQ4QXJyYXk6Xyx0b0xvY2FsQnVmZmVyVHlwZShlKXtjb25zdCB0PWU/LltTeW1ib2wudG9TdHJpbmdUYWddPz9PYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZSk7aWYoIlVpbnQ4QXJyYXkiPT09dClyZXR1cm4gZTtpZihBcnJheUJ1ZmZlci5pc1ZpZXcoZSkpcmV0dXJuIG5ldyBVaW50OEFycmF5KGUuYnVmZmVyLnNsaWNlKGUuYnl0ZU9mZnNldCxlLmJ5dGVPZmZzZXQrZS5ieXRlTGVuZ3RoKSk7aWYoIkFycmF5QnVmZmVyIj09PXR8fCJTaGFyZWRBcnJheUJ1ZmZlciI9PT10fHwiW29iamVjdCBBcnJheUJ1ZmZlcl0iPT09dHx8IltvYmplY3QgU2hhcmVkQXJyYXlCdWZmZXJdIj09PXQpcmV0dXJuIG5ldyBVaW50OEFycmF5KGUpO3Rocm93IG5ldyBaKCJDYW5ub3QgbWFrZSBhIFVpbnQ4QXJyYXkgZnJvbSBwYXNzZWQgcG90ZW50aWFsQnVmZmVyLiIpfSxhbGxvY2F0ZShlKXtpZigibnVtYmVyIiE9dHlwZW9mIGUpdGhyb3cgbmV3IFR5cGVFcnJvcihgVGhlICJzaXplIiBhcmd1bWVudCBtdXN0IGJlIG9mIHR5cGUgbnVtYmVyLiBSZWNlaXZlZCAke1N0cmluZyhlKX1gKTtyZXR1cm4gbmV3IFVpbnQ4QXJyYXkoZSl9LGFsbG9jYXRlVW5zYWZlOmU9PnVlLmFsbG9jYXRlKGUpLGNvbXBhcmUoZSx0KXtpZihlPT09dClyZXR1cm4gMDtjb25zdCBuPU1hdGgubWluKGUubGVuZ3RoLHQubGVuZ3RoKTtmb3IobGV0IHI9MDtyPG47cisrKXtpZihlW3JdPHRbcl0pcmV0dXJuLTE7aWYoZVtyXT50W3JdKXJldHVybiAxfXJldHVybiBlLmxlbmd0aDx0Lmxlbmd0aD8tMTplLmxlbmd0aD50Lmxlbmd0aD8xOjB9LGNvbmNhdChlKXtpZigwPT09ZS5sZW5ndGgpcmV0dXJuIHVlLmFsbG9jYXRlKDApO2xldCB0PTA7Zm9yKGNvbnN0IG4gb2YgZSl0Kz1uLmxlbmd0aDtjb25zdCBuPXVlLmFsbG9jYXRlKHQpO2xldCByPTA7Zm9yKGNvbnN0IHQgb2YgZSluLnNldCh0LHIpLHIrPXQubGVuZ3RoO3JldHVybiBufSxjb3B5KGUsdCxuLHIsaSl7aWYodm9pZCAwIT09aSYmaTwwKXRocm93IG5ldyBSYW5nZUVycm9yKGBUaGUgdmFsdWUgb2YgInNvdXJjZUVuZCIgaXMgb3V0IG9mIHJhbmdlLiBJdCBtdXN0IGJlID49IDAuIFJlY2VpdmVkICR7aX1gKTtpZihpPWk/P2UubGVuZ3RoLHZvaWQgMCE9PXImJihyPDB8fHI+aSkpdGhyb3cgbmV3IFJhbmdlRXJyb3IoYFRoZSB2YWx1ZSBvZiAic291cmNlU3RhcnQiIGlzIG91dCBvZiByYW5nZS4gSXQgbXVzdCBiZSA+PSAwIGFuZCA8PSAke2l9LiBSZWNlaXZlZCAke3J9YCk7aWYocj1yPz8wLHZvaWQgMCE9PW4mJm48MCl0aHJvdyBuZXcgUmFuZ2VFcnJvcihgVGhlIHZhbHVlIG9mICJ0YXJnZXRTdGFydCIgaXMgb3V0IG9mIHJhbmdlLiBJdCBtdXN0IGJlID49IDAuIFJlY2VpdmVkICR7bn1gKTtuPW4/PzA7Y29uc3Qgbz1lLnN1YmFycmF5KHIsaSkscz1NYXRoLm1pbihvLmxlbmd0aCx0Lmxlbmd0aC1uKTtyZXR1cm4gczw9MD8wOih0LnNldChvLnN1YmFycmF5KDAscyksbikscyl9LGVxdWFscyhlLHQpe2lmKGUuYnl0ZUxlbmd0aCE9PXQuYnl0ZUxlbmd0aClyZXR1cm4hMTtmb3IobGV0IG49MDtuPGUuYnl0ZUxlbmd0aDtuKyspaWYoZVtuXSE9PXRbbl0pcmV0dXJuITE7cmV0dXJuITB9LGZyb21OdW1iZXJBcnJheTplPT5VaW50OEFycmF5LmZyb20oZSksZnJvbUJhc2U2NDplPT5VaW50OEFycmF5LmZyb20oYXRvYihlKSwoZT0+ZS5jaGFyQ29kZUF0KDApKSksZnJvbVVURjg6ZT0+KG5ldyBUZXh0RW5jb2RlcikuZW5jb2RlKGUpLHRvQmFzZTY0OmU9PmJ0b2EodWUudG9JU084ODU5MShlKSksZnJvbUlTTzg4NTkxOmU9PlVpbnQ4QXJyYXkuZnJvbShlLChlPT4yNTUmZS5jaGFyQ29kZUF0KDApKSksdG9JU084ODU5MTplPT5BcnJheS5mcm9tKFVpbnQxNkFycmF5LmZyb20oZSksKGU9PlN0cmluZy5mcm9tQ2hhckNvZGUoZSkpKS5qb2luKCIiKSxmcm9tSGV4KGUpe2NvbnN0IHQ9ZS5sZW5ndGglMj09MD9lOmUuc2xpY2UoMCxlLmxlbmd0aC0xKSxuPVtdO2ZvcihsZXQgZT0wO2U8dC5sZW5ndGg7ZSs9Mil7Y29uc3Qgcj10W2VdLGk9dFtlKzFdO2lmKCFmZS50ZXN0KHIpKWJyZWFrO2lmKCFmZS50ZXN0KGkpKWJyZWFrO2NvbnN0IG89TnVtYmVyLnBhcnNlSW50KGAke3J9JHtpfWAsMTYpO24ucHVzaChvKX1yZXR1cm4gVWludDhBcnJheS5mcm9tKG4pfSx0b0hleDplPT5BcnJheS5mcm9tKGUsKGU9PmUudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsIjAiKSkpLmpvaW4oIiIpLHRvVVRGOChlLHQsbixyKXtjb25zdCBpPW4tdDw9MjA/cmUoZSx0LG4pOm51bGw7cmV0dXJuIG51bGwhPWk/aTpuZShlLHQsbixyKX0sdXRmOEJ5dGVMZW5ndGg6ZT0+KG5ldyBUZXh0RW5jb2RlcikuZW5jb2RlKGUpLmJ5dGVMZW5ndGgsZW5jb2RlVVRGOEludG8oZSx0LG4pe2NvbnN0IHI9KG5ldyBUZXh0RW5jb2RlcikuZW5jb2RlKHQpO3JldHVybiBlLnNldChyLG4pLHIuYnl0ZUxlbmd0aH0scmFuZG9tQnl0ZXM6bGUsc3dhcDMyKGUpe2lmKGUubGVuZ3RoJTQhPTApdGhyb3cgbmV3IFJhbmdlRXJyb3IoIkJ1ZmZlciBzaXplIG11c3QgYmUgYSBtdWx0aXBsZSBvZiAzMi1iaXRzIik7Zm9yKGxldCB0PTA7dDxlLmxlbmd0aDt0Kz00KXtjb25zdCBuPWVbdF0scj1lW3QrMV0saT1lW3QrMl0sbz1lW3QrM107ZVt0XT1vLGVbdCsxXT1pLGVbdCsyXT1yLGVbdCszXT1ufXJldHVybiBlfX0sX2U9ImZ1bmN0aW9uIj09dHlwZW9mIEJ1ZmZlciYmITAhPT1CdWZmZXIucHJvdG90eXBlPy5faXNCdWZmZXI/YWU6dWUsZ2U9U3ltYm9sLmZvcigiQEBtZGIuYnNvbi50eXBlIik7Y2xhc3MgaGV7Z2V0W2dlXSgpe3JldHVybiB0aGlzLl9ic29udHlwZX1nZXRbeV0oKXtyZXR1cm4gcH1bU3ltYm9sLmZvcigibm9kZWpzLnV0aWwuaW5zcGVjdC5jdXN0b20iKV0oZSx0LG4pe3JldHVybiB0aGlzLmluc3BlY3QoZSx0LG4pfX1jb25zdCBiZT1uZXcgRmxvYXQ2NEFycmF5KDEpLGRlPW5ldyBVaW50OEFycmF5KGJlLmJ1ZmZlciwwLDgpO2JlWzBdPS0xO2NvbnN0IHdlPTA9PT1kZVs3XSxwZT17aXNCaWdFbmRpYW46d2UsZ2V0Tm9ubmVnYXRpdmVJbnQzMkxFKGUsdCl7aWYoZVt0KzNdPjEyNyl0aHJvdyBuZXcgUmFuZ2VFcnJvcihgU2l6ZSBjYW5ub3QgYmUgbmVnYXRpdmUgYXQgb2Zmc2V0OiAke3R9YCk7cmV0dXJuIGVbdF18ZVt0KzFdPDw4fGVbdCsyXTw8MTZ8ZVt0KzNdPDwyNH0sZ2V0SW50MzJMRTooZSx0KT0+ZVt0XXxlW3QrMV08PDh8ZVt0KzJdPDwxNnxlW3QrM108PDI0LGdldFVpbnQzMkxFOihlLHQpPT5lW3RdKzI1NiplW3QrMV0rNjU1MzYqZVt0KzJdKzE2Nzc3MjE2KmVbdCszXSxnZXRVaW50MzJCRTooZSx0KT0+ZVt0KzNdKzI1NiplW3QrMl0rNjU1MzYqZVt0KzFdKzE2Nzc3MjE2KmVbdF0sZ2V0QmlnSW50NjRMRTooZSx0KT0+KEJpZ0ludChlW3QrNF0rMjU2KmVbdCs1XSs2NTUzNiplW3QrNl0rKGVbdCs3XTw8MjQpKTw8MzJuKStCaWdJbnQoZVt0XSsyNTYqZVt0KzFdKzY1NTM2KmVbdCsyXSsxNjc3NzIxNiplW3QrM10pLGdldEZsb2F0NjRMRTp3ZT8oZSx0KT0+KGRlWzddPWVbdF0sZGVbNl09ZVt0KzFdLGRlWzVdPWVbdCsyXSxkZVs0XT1lW3QrM10sZGVbM109ZVt0KzRdLGRlWzJdPWVbdCs1XSxkZVsxXT1lW3QrNl0sZGVbMF09ZVt0KzddLGJlWzBdKTooZSx0KT0+KGRlWzBdPWVbdF0sZGVbMV09ZVt0KzFdLGRlWzJdPWVbdCsyXSxkZVszXT1lW3QrM10sZGVbNF09ZVt0KzRdLGRlWzVdPWVbdCs1XSxkZVs2XT1lW3QrNl0sZGVbN109ZVt0KzddLGJlWzBdKSxzZXRJbnQzMkJFOihlLHQsbik9PihlW3QrM109bixuPj4+PTgsZVt0KzJdPW4sbj4+Pj04LGVbdCsxXT1uLG4+Pj49OCxlW3RdPW4sNCksc2V0SW50MzJMRTooZSx0LG4pPT4oZVt0XT1uLG4+Pj49OCxlW3QrMV09bixuPj4+PTgsZVt0KzJdPW4sbj4+Pj04LGVbdCszXT1uLDQpLHNldEJpZ0ludDY0TEUoZSx0LG4pe2NvbnN0IHI9MHhmZmZmZmZmZm47bGV0IGk9TnVtYmVyKG4mcik7ZVt0XT1pLGk+Pj04LGVbdCsxXT1pLGk+Pj04LGVbdCsyXT1pLGk+Pj04LGVbdCszXT1pO2xldCBvPU51bWJlcihuPj4zMm4mcik7cmV0dXJuIGVbdCs0XT1vLG8+Pj04LGVbdCs1XT1vLG8+Pj04LGVbdCs2XT1vLG8+Pj04LGVbdCs3XT1vLDh9LHNldEZsb2F0NjRMRTp3ZT8oZSx0LG4pPT4oYmVbMF09bixlW3RdPWRlWzddLGVbdCsxXT1kZVs2XSxlW3QrMl09ZGVbNV0sZVt0KzNdPWRlWzRdLGVbdCs0XT1kZVszXSxlW3QrNV09ZGVbMl0sZVt0KzZdPWRlWzFdLGVbdCs3XT1kZVswXSw4KTooZSx0LG4pPT4oYmVbMF09bixlW3RdPWRlWzBdLGVbdCsxXT1kZVsxXSxlW3QrMl09ZGVbMl0sZVt0KzNdPWRlWzNdLGVbdCs0XT1kZVs0XSxlW3QrNV09ZGVbNV0sZVt0KzZdPWRlWzZdLGVbdCs3XT1kZVs3XSw4KX07Y2xhc3MgeWUgZXh0ZW5kcyBoZXtnZXQgX2Jzb250eXBlKCl7cmV0dXJuIkJpbmFyeSJ9c3RhdGljIEJTT05fQklOQVJZX1NVQlRZUEVfREVGQVVMVD0wO3N0YXRpYyBCVUZGRVJfU0laRT0yNTY7c3RhdGljIFNVQlRZUEVfREVGQVVMVD0wO3N0YXRpYyBTVUJUWVBFX0ZVTkNUSU9OPTE7c3RhdGljIFNVQlRZUEVfQllURV9BUlJBWT0yO3N0YXRpYyBTVUJUWVBFX1VVSURfT0xEPTM7c3RhdGljIFNVQlRZUEVfVVVJRD00O3N0YXRpYyBTVUJUWVBFX01ENT01O3N0YXRpYyBTVUJUWVBFX0VOQ1JZUFRFRD02O3N0YXRpYyBTVUJUWVBFX0NPTFVNTj03O3N0YXRpYyBTVUJUWVBFX1NFTlNJVElWRT04O3N0YXRpYyBTVUJUWVBFX1ZFQ1RPUj05O3N0YXRpYyBTVUJUWVBFX1VTRVJfREVGSU5FRD0xMjg7c3RhdGljIFZFQ1RPUl9UWVBFPU9iamVjdC5mcmVlemUoe0ludDg6MyxGbG9hdDMyOjM5LFBhY2tlZEJpdDoxNn0pO2J1ZmZlcjtzdWJfdHlwZTtwb3NpdGlvbjtjb25zdHJ1Y3RvcihlLHQpe2lmKHN1cGVyKCksbnVsbCE9ZSYmInN0cmluZyI9PXR5cGVvZiBlJiYhQXJyYXlCdWZmZXIuaXNWaWV3KGUpJiYhZyhlKSYmIUFycmF5LmlzQXJyYXkoZSkpdGhyb3cgbmV3IFooIkJpbmFyeSBjYW4gb25seSBiZSBjb25zdHJ1Y3RlZCBmcm9tIFVpbnQ4QXJyYXkgb3IgbnVtYmVyW10iKTt0aGlzLnN1Yl90eXBlPXQ/P3llLkJTT05fQklOQVJZX1NVQlRZUEVfREVGQVVMVCxudWxsPT1lPyh0aGlzLmJ1ZmZlcj1fZS5hbGxvY2F0ZSh5ZS5CVUZGRVJfU0laRSksdGhpcy5wb3NpdGlvbj0wKToodGhpcy5idWZmZXI9QXJyYXkuaXNBcnJheShlKT9fZS5mcm9tTnVtYmVyQXJyYXkoZSk6X2UudG9Mb2NhbEJ1ZmZlclR5cGUoZSksdGhpcy5wb3NpdGlvbj10aGlzLmJ1ZmZlci5ieXRlTGVuZ3RoKX1wdXQoZSl7aWYoInN0cmluZyI9PXR5cGVvZiBlJiYxIT09ZS5sZW5ndGgpdGhyb3cgbmV3IFooIm9ubHkgYWNjZXB0cyBzaW5nbGUgY2hhcmFjdGVyIFN0cmluZyIpO2lmKCJudW1iZXIiIT10eXBlb2YgZSYmMSE9PWUubGVuZ3RoKXRocm93IG5ldyBaKCJvbmx5IGFjY2VwdHMgc2luZ2xlIGNoYXJhY3RlciBVaW50OEFycmF5IG9yIEFycmF5Iik7bGV0IHQ7aWYodD0ic3RyaW5nIj09dHlwZW9mIGU/ZS5jaGFyQ29kZUF0KDApOiJudW1iZXIiPT10eXBlb2YgZT9lOmVbMF0sdDwwfHx0PjI1NSl0aHJvdyBuZXcgWigib25seSBhY2NlcHRzIG51bWJlciBpbiBhIHZhbGlkIHVuc2lnbmVkIGJ5dGUgcmFuZ2UgMC0yNTUiKTtpZih0aGlzLmJ1ZmZlci5ieXRlTGVuZ3RoPnRoaXMucG9zaXRpb24pdGhpcy5idWZmZXJbdGhpcy5wb3NpdGlvbisrXT10O2Vsc2V7Y29uc3QgZT1fZS5hbGxvY2F0ZSh5ZS5CVUZGRVJfU0laRSt0aGlzLmJ1ZmZlci5sZW5ndGgpO2Uuc2V0KHRoaXMuYnVmZmVyLDApLHRoaXMuYnVmZmVyPWUsdGhpcy5idWZmZXJbdGhpcy5wb3NpdGlvbisrXT10fX13cml0ZShlLHQpe2lmKHQ9Im51bWJlciI9PXR5cGVvZiB0P3Q6dGhpcy5wb3NpdGlvbix0aGlzLmJ1ZmZlci5ieXRlTGVuZ3RoPHQrZS5sZW5ndGgpe2NvbnN0IHQ9X2UuYWxsb2NhdGUodGhpcy5idWZmZXIuYnl0ZUxlbmd0aCtlLmxlbmd0aCk7dC5zZXQodGhpcy5idWZmZXIsMCksdGhpcy5idWZmZXI9dH1pZihBcnJheUJ1ZmZlci5pc1ZpZXcoZSkpdGhpcy5idWZmZXIuc2V0KF9lLnRvTG9jYWxCdWZmZXJUeXBlKGUpLHQpLHRoaXMucG9zaXRpb249dCtlLmJ5dGVMZW5ndGg+dGhpcy5wb3NpdGlvbj90K2UubGVuZ3RoOnRoaXMucG9zaXRpb247ZWxzZSBpZigic3RyaW5nIj09dHlwZW9mIGUpdGhyb3cgbmV3IFooImlucHV0IGNhbm5vdCBiZSBzdHJpbmciKX1yZWFkKGUsdCl7Y29uc3Qgbj1lKyh0PXQmJnQ+MD90OnRoaXMucG9zaXRpb24pO3JldHVybiB0aGlzLmJ1ZmZlci5zdWJhcnJheShlLG4+dGhpcy5wb3NpdGlvbj90aGlzLnBvc2l0aW9uOm4pfXZhbHVlKCl7cmV0dXJuIHRoaXMuYnVmZmVyLmxlbmd0aD09PXRoaXMucG9zaXRpb24/dGhpcy5idWZmZXI6dGhpcy5idWZmZXIuc3ViYXJyYXkoMCx0aGlzLnBvc2l0aW9uKX1sZW5ndGgoKXtyZXR1cm4gdGhpcy5wb3NpdGlvbn10b0pTT04oKXtyZXR1cm4gX2UudG9CYXNlNjQodGhpcy5idWZmZXIuc3ViYXJyYXkoMCx0aGlzLnBvc2l0aW9uKSl9dG9TdHJpbmcoZSl7cmV0dXJuImhleCI9PT1lP19lLnRvSGV4KHRoaXMuYnVmZmVyLnN1YmFycmF5KDAsdGhpcy5wb3NpdGlvbikpOiJiYXNlNjQiPT09ZT9fZS50b0Jhc2U2NCh0aGlzLmJ1ZmZlci5zdWJhcnJheSgwLHRoaXMucG9zaXRpb24pKTpfZS50b1VURjgodGhpcy5idWZmZXIsMCx0aGlzLnBvc2l0aW9uLCExKX10b0V4dGVuZGVkSlNPTihlKXtlPWV8fHt9LHRoaXMuc3ViX3R5cGU9PT15ZS5TVUJUWVBFX1ZFQ1RPUiYmbWUodGhpcyk7Y29uc3QgdD1fZS50b0Jhc2U2NCh0aGlzLmJ1ZmZlciksbj1OdW1iZXIodGhpcy5zdWJfdHlwZSkudG9TdHJpbmcoMTYpO3JldHVybiBlLmxlZ2FjeT97JGJpbmFyeTp0LCR0eXBlOjE9PT1uLmxlbmd0aD8iMCIrbjpufTp7JGJpbmFyeTp7YmFzZTY0OnQsc3ViVHlwZToxPT09bi5sZW5ndGg/IjAiK246bn19fXRvVVVJRCgpe2lmKHRoaXMuc3ViX3R5cGU9PT15ZS5TVUJUWVBFX1VVSUQpcmV0dXJuIG5ldyB4ZSh0aGlzLmJ1ZmZlci5zdWJhcnJheSgwLHRoaXMucG9zaXRpb24pKTt0aHJvdyBuZXcgWihgQmluYXJ5IHN1Yl90eXBlICIke3RoaXMuc3ViX3R5cGV9IiBpcyBub3Qgc3VwcG9ydGVkIGZvciBjb252ZXJ0aW5nIHRvIFVVSUQuIE9ubHkgIiR7eWUuU1VCVFlQRV9VVUlEfSIgaXMgY3VycmVudGx5IHN1cHBvcnRlZC5gKX1zdGF0aWMgY3JlYXRlRnJvbUhleFN0cmluZyhlLHQpe3JldHVybiBuZXcgeWUoX2UuZnJvbUhleChlKSx0KX1zdGF0aWMgY3JlYXRlRnJvbUJhc2U2NChlLHQpe3JldHVybiBuZXcgeWUoX2UuZnJvbUJhc2U2NChlKSx0KX1zdGF0aWMgZnJvbUV4dGVuZGVkSlNPTihlLHQpe2xldCBuLHI7aWYodD10fHx7fSwiJGJpbmFyeSJpbiBlP3QubGVnYWN5JiYic3RyaW5nIj09dHlwZW9mIGUuJGJpbmFyeSYmIiR0eXBlImluIGU/KHI9ZS4kdHlwZT9wYXJzZUludChlLiR0eXBlLDE2KTowLG49X2UuZnJvbUJhc2U2NChlLiRiaW5hcnkpKToic3RyaW5nIiE9dHlwZW9mIGUuJGJpbmFyeSYmKHI9ZS4kYmluYXJ5LnN1YlR5cGU/cGFyc2VJbnQoZS4kYmluYXJ5LnN1YlR5cGUsMTYpOjAsbj1fZS5mcm9tQmFzZTY0KGUuJGJpbmFyeS5iYXNlNjQpKToiJHV1aWQiaW4gZSYmKHI9NCxuPXhlLmJ5dGVzRnJvbVN0cmluZyhlLiR1dWlkKSksIW4pdGhyb3cgbmV3IFooYFVuZXhwZWN0ZWQgQmluYXJ5IEV4dGVuZGVkIEpTT04gZm9ybWF0ICR7SlNPTi5zdHJpbmdpZnkoZSl9YCk7cmV0dXJuIHI9PT1IP25ldyB4ZShuKTpuZXcgeWUobixyKX1pbnNwZWN0KGUsdCxuKXtuPz89dztyZXR1cm5gQmluYXJ5LmNyZWF0ZUZyb21CYXNlNjQoJHtuKF9lLnRvQmFzZTY0KHRoaXMuYnVmZmVyLnN1YmFycmF5KDAsdGhpcy5wb3NpdGlvbikpLHQpfSwgJHtuKHRoaXMuc3ViX3R5cGUsdCl9KWB9dG9JbnQ4QXJyYXkoKXtpZih0aGlzLnN1Yl90eXBlIT09eWUuU1VCVFlQRV9WRUNUT1IpdGhyb3cgbmV3IFooIkJpbmFyeSBzdWJfdHlwZSBpcyBub3QgVmVjdG9yIik7aWYodGhpcy5idWZmZXJbMF0hPT15ZS5WRUNUT1JfVFlQRS5JbnQ4KXRocm93IG5ldyBaKCJCaW5hcnkgZGF0YXR5cGUgZmllbGQgaXMgbm90IEludDgiKTtyZXR1cm4gbWUodGhpcyksbmV3IEludDhBcnJheSh0aGlzLmJ1ZmZlci5idWZmZXIuc2xpY2UodGhpcy5idWZmZXIuYnl0ZU9mZnNldCsyLHRoaXMuYnVmZmVyLmJ5dGVPZmZzZXQrdGhpcy5wb3NpdGlvbikpfXRvRmxvYXQzMkFycmF5KCl7aWYodGhpcy5zdWJfdHlwZSE9PXllLlNVQlRZUEVfVkVDVE9SKXRocm93IG5ldyBaKCJCaW5hcnkgc3ViX3R5cGUgaXMgbm90IFZlY3RvciIpO2lmKHRoaXMuYnVmZmVyWzBdIT09eWUuVkVDVE9SX1RZUEUuRmxvYXQzMil0aHJvdyBuZXcgWigiQmluYXJ5IGRhdGF0eXBlIGZpZWxkIGlzIG5vdCBGbG9hdDMyIik7bWUodGhpcyk7Y29uc3QgZT1uZXcgVWludDhBcnJheSh0aGlzLmJ1ZmZlci5idWZmZXIuc2xpY2UodGhpcy5idWZmZXIuYnl0ZU9mZnNldCsyLHRoaXMuYnVmZmVyLmJ5dGVPZmZzZXQrdGhpcy5wb3NpdGlvbikpO3JldHVybiBwZS5pc0JpZ0VuZGlhbiYmX2Uuc3dhcDMyKGUpLG5ldyBGbG9hdDMyQXJyYXkoZS5idWZmZXIpfXRvUGFja2VkQml0cygpe2lmKHRoaXMuc3ViX3R5cGUhPT15ZS5TVUJUWVBFX1ZFQ1RPUil0aHJvdyBuZXcgWigiQmluYXJ5IHN1Yl90eXBlIGlzIG5vdCBWZWN0b3IiKTtpZih0aGlzLmJ1ZmZlclswXSE9PXllLlZFQ1RPUl9UWVBFLlBhY2tlZEJpdCl0aHJvdyBuZXcgWigiQmluYXJ5IGRhdGF0eXBlIGZpZWxkIGlzIG5vdCBwYWNrZWQgYml0Iik7cmV0dXJuIG1lKHRoaXMpLG5ldyBVaW50OEFycmF5KHRoaXMuYnVmZmVyLmJ1ZmZlci5zbGljZSh0aGlzLmJ1ZmZlci5ieXRlT2Zmc2V0KzIsdGhpcy5idWZmZXIuYnl0ZU9mZnNldCt0aGlzLnBvc2l0aW9uKSl9dG9CaXRzKCl7aWYodGhpcy5zdWJfdHlwZSE9PXllLlNVQlRZUEVfVkVDVE9SKXRocm93IG5ldyBaKCJCaW5hcnkgc3ViX3R5cGUgaXMgbm90IFZlY3RvciIpO2lmKHRoaXMuYnVmZmVyWzBdIT09eWUuVkVDVE9SX1RZUEUuUGFja2VkQml0KXRocm93IG5ldyBaKCJCaW5hcnkgZGF0YXR5cGUgZmllbGQgaXMgbm90IHBhY2tlZCBiaXQiKTttZSh0aGlzKTtjb25zdCBlPTgqKHRoaXMubGVuZ3RoKCktMiktdGhpcy5idWZmZXJbMV0sdD1uZXcgSW50OEFycmF5KGUpO2ZvcihsZXQgZT0wO2U8dC5sZW5ndGg7ZSsrKXtjb25zdCBuPWUvOHwwLHI9dGhpcy5idWZmZXJbbisyXT4+Ny1lJTgmMTt0W2VdPXJ9cmV0dXJuIHR9c3RhdGljIGZyb21JbnQ4QXJyYXkoZSl7Y29uc3QgdD1fZS5hbGxvY2F0ZShlLmJ5dGVMZW5ndGgrMik7dFswXT15ZS5WRUNUT1JfVFlQRS5JbnQ4LHRbMV09MDtjb25zdCBuPW5ldyBVaW50OEFycmF5KGUuYnVmZmVyLGUuYnl0ZU9mZnNldCxlLmJ5dGVMZW5ndGgpO3Quc2V0KG4sMik7Y29uc3Qgcj1uZXcgdGhpcyh0LHRoaXMuU1VCVFlQRV9WRUNUT1IpO3JldHVybiBtZShyKSxyfXN0YXRpYyBmcm9tRmxvYXQzMkFycmF5KGUpe2NvbnN0IHQ9X2UuYWxsb2NhdGUoZS5ieXRlTGVuZ3RoKzIpO3RbMF09eWUuVkVDVE9SX1RZUEUuRmxvYXQzMix0WzFdPTA7Y29uc3Qgbj1uZXcgVWludDhBcnJheShlLmJ1ZmZlcixlLmJ5dGVPZmZzZXQsZS5ieXRlTGVuZ3RoKTt0LnNldChuLDIpLHBlLmlzQmlnRW5kaWFuJiZfZS5zd2FwMzIobmV3IFVpbnQ4QXJyYXkodC5idWZmZXIsMikpO2NvbnN0IHI9bmV3IHRoaXModCx0aGlzLlNVQlRZUEVfVkVDVE9SKTtyZXR1cm4gbWUocikscn1zdGF0aWMgZnJvbVBhY2tlZEJpdHMoZSx0PTApe2NvbnN0IG49X2UuYWxsb2NhdGUoZS5ieXRlTGVuZ3RoKzIpO25bMF09eWUuVkVDVE9SX1RZUEUuUGFja2VkQml0LG5bMV09dCxuLnNldChlLDIpO2NvbnN0IHI9bmV3IHRoaXMobix0aGlzLlNVQlRZUEVfVkVDVE9SKTtyZXR1cm4gbWUocikscn1zdGF0aWMgZnJvbUJpdHMoZSl7Y29uc3QgdD1lLmxlbmd0aCs3Pj4+MyxuPW5ldyBVaW50OEFycmF5KHQrMik7blswXT15ZS5WRUNUT1JfVFlQRS5QYWNrZWRCaXQ7Y29uc3Qgcj1lLmxlbmd0aCU4O25bMV09MD09PXI/MDo4LXI7Zm9yKGxldCB0PTA7dDxlLmxlbmd0aDt0Kyspe2NvbnN0IHI9dD4+PjMsaT1lW3RdO2lmKDAhPT1pJiYxIT09aSl0aHJvdyBuZXcgWihgSW52YWxpZCBiaXQgdmFsdWUgYXQgJHt0fTogbXVzdCBiZSAwIG9yIDEsIGZvdW5kICR7ZVt0XX1gKTtpZigwPT09aSljb250aW51ZTtjb25zdCBvPTctdCU4O25bcisyXXw9aTw8b31yZXR1cm4gbmV3IHRoaXMobix5ZS5TVUJUWVBFX1ZFQ1RPUil9fWZ1bmN0aW9uIG1lKGUpe2lmKGUuc3ViX3R5cGUhPT15ZS5TVUJUWVBFX1ZFQ1RPUilyZXR1cm47Y29uc3QgdD1lLnBvc2l0aW9uLG49ZS5idWZmZXJbMF0scj1lLmJ1ZmZlclsxXTtpZigobj09PXllLlZFQ1RPUl9UWVBFLkZsb2F0MzJ8fG49PT15ZS5WRUNUT1JfVFlQRS5JbnQ4KSYmMCE9PXIpdGhyb3cgbmV3IFooIkludmFsaWQgVmVjdG9yOiBwYWRkaW5nIG11c3QgYmUgemVybyBmb3IgaW50OCBhbmQgZmxvYXQzMiB2ZWN0b3JzIik7aWYobj09PXllLlZFQ1RPUl9UWVBFLkZsb2F0MzImJjAhPT10JiZ0LTIhPTAmJih0LTIpJTQhPTApdGhyb3cgbmV3IFooIkludmFsaWQgVmVjdG9yOiBGbG9hdDMyIHZlY3RvciBtdXN0IGNvbnRhaW4gYSBtdWx0aXBsZSBvZiA0IGJ5dGVzIik7aWYobj09PXllLlZFQ1RPUl9UWVBFLlBhY2tlZEJpdCYmMCE9PXImJjI9PT10KXRocm93IG5ldyBaKCJJbnZhbGlkIFZlY3RvcjogcGFkZGluZyBtdXN0IGJlIHplcm8gZm9yIHBhY2tlZCBiaXQgdmVjdG9ycyB0aGF0IGFyZSBlbXB0eSIpO2lmKG49PT15ZS5WRUNUT1JfVFlQRS5QYWNrZWRCaXQmJnI+Nyl0aHJvdyBuZXcgWihgSW52YWxpZCBWZWN0b3I6IHBhZGRpbmcgbXVzdCBiZSBhIHZhbHVlIGJldHdlZW4gMCBhbmQgNy4gZm91bmQ6ICR7cn1gKX1jb25zdCBTZT0vXlswLTlBLUZdezMyfSQvaSxCZT0vXlswLTlBLUZdezh9LVswLTlBLUZdezR9LVswLTlBLUZdezR9LVswLTlBLUZdezR9LVswLTlBLUZdezEyfSQvaTtjbGFzcyB4ZSBleHRlbmRzIHlle2NvbnN0cnVjdG9yKGUpe2xldCB0O2lmKG51bGw9PWUpdD14ZS5nZW5lcmF0ZSgpO2Vsc2UgaWYoZSBpbnN0YW5jZW9mIHhlKXQ9X2UudG9Mb2NhbEJ1ZmZlclR5cGUobmV3IFVpbnQ4QXJyYXkoZS5idWZmZXIpKTtlbHNlIGlmKEFycmF5QnVmZmVyLmlzVmlldyhlKSYmMTY9PT1lLmJ5dGVMZW5ndGgpdD1fZS50b0xvY2FsQnVmZmVyVHlwZShlKTtlbHNle2lmKCJzdHJpbmciIT10eXBlb2YgZSl0aHJvdyBuZXcgWigiQXJndW1lbnQgcGFzc2VkIGluIFVVSUQgY29uc3RydWN0b3IgbXVzdCBiZSBhIFVVSUQsIGEgMTYgYnl0ZSBCdWZmZXIgb3IgYSAzMi8zNiBjaGFyYWN0ZXIgaGV4IHN0cmluZyAoZGFzaGVzIGV4Y2x1ZGVkL2luY2x1ZGVkLCBmb3JtYXQ6IHh4eHh4eHh4LXh4eHgteHh4eC14eHh4LXh4eHh4eHh4eHh4eCkuIik7dD14ZS5ieXRlc0Zyb21TdHJpbmcoZSl9c3VwZXIodCxIKX1nZXQgaWQoKXtyZXR1cm4gdGhpcy5idWZmZXJ9c2V0IGlkKGUpe3RoaXMuYnVmZmVyPWV9dG9IZXhTdHJpbmcoZT0hMCl7cmV0dXJuIGU/W19lLnRvSGV4KHRoaXMuYnVmZmVyLnN1YmFycmF5KDAsNCkpLF9lLnRvSGV4KHRoaXMuYnVmZmVyLnN1YmFycmF5KDQsNikpLF9lLnRvSGV4KHRoaXMuYnVmZmVyLnN1YmFycmF5KDYsOCkpLF9lLnRvSGV4KHRoaXMuYnVmZmVyLnN1YmFycmF5KDgsMTApKSxfZS50b0hleCh0aGlzLmJ1ZmZlci5zdWJhcnJheSgxMCwxNikpXS5qb2luKCItIik6X2UudG9IZXgodGhpcy5idWZmZXIpfXRvU3RyaW5nKGUpe3JldHVybiJoZXgiPT09ZT9fZS50b0hleCh0aGlzLmlkKToiYmFzZTY0Ij09PWU/X2UudG9CYXNlNjQodGhpcy5pZCk6dGhpcy50b0hleFN0cmluZygpfXRvSlNPTigpe3JldHVybiB0aGlzLnRvSGV4U3RyaW5nKCl9ZXF1YWxzKGUpe2lmKCFlKXJldHVybiExO2lmKGUgaW5zdGFuY2VvZiB4ZSlyZXR1cm4gX2UuZXF1YWxzKGUuaWQsdGhpcy5pZCk7dHJ5e3JldHVybiBfZS5lcXVhbHMobmV3IHhlKGUpLmlkLHRoaXMuaWQpfWNhdGNoe3JldHVybiExfX10b0JpbmFyeSgpe3JldHVybiBuZXcgeWUodGhpcy5pZCx5ZS5TVUJUWVBFX1VVSUQpfXN0YXRpYyBnZW5lcmF0ZSgpe2NvbnN0IGU9X2UucmFuZG9tQnl0ZXMoMTYpO3JldHVybiBlWzZdPTE1JmVbNl18NjQsZVs4XT02MyZlWzhdfDEyOCxlfXN0YXRpYyBpc1ZhbGlkKGUpe3JldHVybiEhZSYmKCJzdHJpbmciPT10eXBlb2YgZT94ZS5pc1ZhbGlkVVVJRFN0cmluZyhlKTpfKGUpPzE2PT09ZS5ieXRlTGVuZ3RoOiJCaW5hcnkiPT09ZS5fYnNvbnR5cGUmJmUuc3ViX3R5cGU9PT10aGlzLlNVQlRZUEVfVVVJRCYmMTY9PT1lLmJ1ZmZlci5ieXRlTGVuZ3RoKX1zdGF0aWMgY3JlYXRlRnJvbUhleFN0cmluZyhlKXtjb25zdCB0PXhlLmJ5dGVzRnJvbVN0cmluZyhlKTtyZXR1cm4gbmV3IHhlKHQpfXN0YXRpYyBjcmVhdGVGcm9tQmFzZTY0KGUpe3JldHVybiBuZXcgeGUoX2UuZnJvbUJhc2U2NChlKSl9c3RhdGljIGJ5dGVzRnJvbVN0cmluZyhlKXtpZigheGUuaXNWYWxpZFVVSURTdHJpbmcoZSkpdGhyb3cgbmV3IFooIlVVSUQgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG11c3QgYmUgMzIgaGV4IGRpZ2l0cyBvciBjYW5vbmljYWwgaHlwaGVuYXRlZCByZXByZXNlbnRhdGlvbiIpO3JldHVybiBfZS5mcm9tSGV4KGUucmVwbGFjZSgvLS9nLCIiKSl9c3RhdGljIGlzVmFsaWRVVUlEU3RyaW5nKGUpe3JldHVybiBTZS50ZXN0KGUpfHxCZS50ZXN0KGUpfWluc3BlY3QoZSx0LG4pe3JldHVybiBuPz89dyxgbmV3IFVVSUQoJHtuKHRoaXMudG9IZXhTdHJpbmcoKSx0KX0pYH19Y2xhc3MgRWUgZXh0ZW5kcyBoZXtnZXQgX2Jzb250eXBlKCl7cmV0dXJuIkNvZGUifWNvZGU7c2NvcGU7Y29uc3RydWN0b3IoZSx0KXtzdXBlcigpLHRoaXMuY29kZT1lLnRvU3RyaW5nKCksdGhpcy5zY29wZT10Pz9udWxsfXRvSlNPTigpe3JldHVybiBudWxsIT10aGlzLnNjb3BlP3tjb2RlOnRoaXMuY29kZSxzY29wZTp0aGlzLnNjb3BlfTp7Y29kZTp0aGlzLmNvZGV9fXRvRXh0ZW5kZWRKU09OKCl7cmV0dXJuIHRoaXMuc2NvcGU/eyRjb2RlOnRoaXMuY29kZSwkc2NvcGU6dGhpcy5zY29wZX06eyRjb2RlOnRoaXMuY29kZX19c3RhdGljIGZyb21FeHRlbmRlZEpTT04oZSl7cmV0dXJuIG5ldyBFZShlLiRjb2RlLGUuJHNjb3BlKX1pbnNwZWN0KGUsdCxuKXtuPz89dztsZXQgcj1uKHRoaXMuY29kZSx0KTtjb25zdCBpPXIuaW5jbHVkZXMoIlxuIik7bnVsbCE9dGhpcy5zY29wZSYmKHIrPWAsJHtpPyJcbiI6IiAifSR7bih0aGlzLnNjb3BlLHQpfWApO3JldHVybmBuZXcgQ29kZSgke2k/IlxuIjoiIn0ke3J9JHtpJiZudWxsPT09dGhpcy5zY29wZT8iXG4iOiIifSlgfX1mdW5jdGlvbiBVZShlKXtyZXR1cm4gbnVsbCE9ZSYmIm9iamVjdCI9PXR5cGVvZiBlJiYiJGlkImluIGUmJm51bGwhPWUuJGlkJiYiJHJlZiJpbiBlJiYic3RyaW5nIj09dHlwZW9mIGUuJHJlZiYmKCEoIiRkYiJpbiBlKXx8IiRkYiJpbiBlJiYic3RyaW5nIj09dHlwZW9mIGUuJGRiKX1jbGFzcyBPZSBleHRlbmRzIGhle2dldCBfYnNvbnR5cGUoKXtyZXR1cm4iREJSZWYifWNvbGxlY3Rpb247b2lkO2RiO2ZpZWxkcztjb25zdHJ1Y3RvcihlLHQsbixyKXtzdXBlcigpO2NvbnN0IGk9ZS5zcGxpdCgiLiIpOzI9PT1pLmxlbmd0aCYmKG49aS5zaGlmdCgpLGU9aS5zaGlmdCgpKSx0aGlzLmNvbGxlY3Rpb249ZSx0aGlzLm9pZD10LHRoaXMuZGI9bix0aGlzLmZpZWxkcz1yfHx7fX1nZXQgbmFtZXNwYWNlKCl7cmV0dXJuIHRoaXMuY29sbGVjdGlvbn1zZXQgbmFtZXNwYWNlKGUpe3RoaXMuY29sbGVjdGlvbj1lfXRvSlNPTigpe2NvbnN0IGU9T2JqZWN0LmFzc2lnbih7JHJlZjp0aGlzLmNvbGxlY3Rpb24sJGlkOnRoaXMub2lkfSx0aGlzLmZpZWxkcyk7cmV0dXJuIG51bGwhPXRoaXMuZGImJihlLiRkYj10aGlzLmRiKSxlfXRvRXh0ZW5kZWRKU09OKGUpe2U9ZXx8e307bGV0IHQ9eyRyZWY6dGhpcy5jb2xsZWN0aW9uLCRpZDp0aGlzLm9pZH07cmV0dXJuIGUubGVnYWN5fHwodGhpcy5kYiYmKHQuJGRiPXRoaXMuZGIpLHQ9T2JqZWN0LmFzc2lnbih0LHRoaXMuZmllbGRzKSksdH1zdGF0aWMgZnJvbUV4dGVuZGVkSlNPTihlKXtjb25zdCB0PU9iamVjdC5hc3NpZ24oe30sZSk7cmV0dXJuIGRlbGV0ZSB0LiRyZWYsZGVsZXRlIHQuJGlkLGRlbGV0ZSB0LiRkYixuZXcgT2UoZS4kcmVmLGUuJGlkLGUuJGRiLHQpfWluc3BlY3QoZSx0LG4pe24/Pz13O2NvbnN0IHI9W24odGhpcy5uYW1lc3BhY2UsdCksbih0aGlzLm9pZCx0KSwuLi50aGlzLmRiP1tuKHRoaXMuZGIsdCldOltdLC4uLk9iamVjdC5rZXlzKHRoaXMuZmllbGRzKS5sZW5ndGg+MD9bbih0aGlzLmZpZWxkcyx0KV06W11dO3JldHVybiByWzFdPW49PT13P2BuZXcgT2JqZWN0SWQoJHtyWzFdfSlgOnJbMV0sYG5ldyBEQlJlZigke3Iuam9pbigiLCAiKX0pYH19ZnVuY3Rpb24gTmUoZSl7aWYoIiI9PT1lKXJldHVybiBlO2xldCB0PTA7Y29uc3Qgbj0iLSI9PT1lW3RdLHI9IisiPT09ZVt0XTsocnx8bikmJih0Kz0xKTtsZXQgaT0hMTtmb3IoO3Q8ZS5sZW5ndGgmJiIwIj09PWVbdF07Kyt0KWk9ITA7cmV0dXJuIGk/YCR7bj8iLSI6IiJ9JHtlLmxlbmd0aD09PXQ/IjAiOmUuc2xpY2UodCl9YDpyP2Uuc2xpY2UoMSk6ZX1sZXQgSWU7dHJ5e0llPW5ldyBXZWJBc3NlbWJseS5JbnN0YW5jZShuZXcgV2ViQXNzZW1ibHkuTW9kdWxlKG5ldyBVaW50OEFycmF5KFswLDk3LDExNSwxMDksMSwwLDAsMCwxLDEzLDIsOTYsMCwxLDEyNyw5Niw0LDEyNywxMjcsMTI3LDEyNywxLDEyNywzLDcsNiwwLDEsMSwxLDEsMSw2LDYsMSwxMjcsMSw2NSwwLDExLDcsNTAsNiwzLDEwOSwxMTcsMTA4LDAsMSw1LDEwMCwxMDUsMTE4LDk1LDExNSwwLDIsNSwxMDAsMTA1LDExOCw5NSwxMTcsMCwzLDUsMTE0LDEwMSwxMDksOTUsMTE1LDAsNCw1LDExNCwxMDEsMTA5LDk1LDExNywwLDUsOCwxMDMsMTAxLDExNiw5NSwxMDQsMTA1LDEwMywxMDQsMCwwLDEwLDE5MSwxLDYsNCwwLDM1LDAsMTEsMzYsMSwxLDEyNiwzMiwwLDE3MywzMiwxLDE3Myw2NiwzMiwxMzQsMTMyLDMyLDIsMTczLDMyLDMsMTczLDY2LDMyLDEzNCwxMzIsMTI2LDM0LDQsNjYsMzIsMTM1LDE2NywzNiwwLDMyLDQsMTY3LDExLDM2LDEsMSwxMjYsMzIsMCwxNzMsMzIsMSwxNzMsNjYsMzIsMTM0LDEzMiwzMiwyLDE3MywzMiwzLDE3Myw2NiwzMiwxMzQsMTMyLDEyNywzNCw0LDY2LDMyLDEzNSwxNjcsMzYsMCwzMiw0LDE2NywxMSwzNiwxLDEsMTI2LDMyLDAsMTczLDMyLDEsMTczLDY2LDMyLDEzNCwxMzIsMzIsMiwxNzMsMzIsMywxNzMsNjYsMzIsMTM0LDEzMiwxMjgsMzQsNCw2NiwzMiwxMzUsMTY3LDM2LDAsMzIsNCwxNjcsMTEsMzYsMSwxLDEyNiwzMiwwLDE3MywzMiwxLDE3Myw2NiwzMiwxMzQsMTMyLDMyLDIsMTczLDMyLDMsMTczLDY2LDMyLDEzNCwxMzIsMTI5LDM0LDQsNjYsMzIsMTM1LDE2NywzNiwwLDMyLDQsMTY3LDExLDM2LDEsMSwxMjYsMzIsMCwxNzMsMzIsMSwxNzMsNjYsMzIsMTM0LDEzMiwzMiwyLDE3MywzMiwzLDE3Myw2NiwzMiwxMzQsMTMyLDEzMCwzNCw0LDY2LDMyLDEzNSwxNjcsMzYsMCwzMiw0LDE2NywxMV0pKSx7fSkuZXhwb3J0c31jYXRjaHt9Y29uc3QgdmU9NDI5NDk2NzI5NixUZT0weDEwMDAwMDAwMDAwMDAwMDAwLCRlPVRlLzIsTGU9e30sQWU9e30sUmU9L14oXCs/MHwoXCt8LSk/WzEtOV1bMC05XSopJC87Y2xhc3MgamUgZXh0ZW5kcyBoZXtnZXQgX2Jzb250eXBlKCl7cmV0dXJuIkxvbmcifWdldCBfX2lzTG9uZ19fKCl7cmV0dXJuITB9aGlnaDtsb3c7dW5zaWduZWQ7Y29uc3RydWN0b3IoZT0wLHQsbil7c3VwZXIoKTtjb25zdCByPSJib29sZWFuIj09dHlwZW9mIHQ/dDpCb29sZWFuKG4pLGk9Im51bWJlciI9PXR5cGVvZiB0P3Q6MCxvPSJzdHJpbmciPT10eXBlb2YgZT9qZS5mcm9tU3RyaW5nKGUscik6ImJpZ2ludCI9PXR5cGVvZiBlP2plLmZyb21CaWdJbnQoZSxyKTp7bG93OjB8ZSxoaWdoOjB8aSx1bnNpZ25lZDpyfTt0aGlzLmxvdz1vLmxvdyx0aGlzLmhpZ2g9by5oaWdoLHRoaXMudW5zaWduZWQ9by51bnNpZ25lZH1zdGF0aWMgVFdPX1BXUl8yND1qZS5mcm9tSW50KDE2Nzc3MjE2KTtzdGF0aWMgTUFYX1VOU0lHTkVEX1ZBTFVFPWplLmZyb21CaXRzKC0xLC0xLCEwKTtzdGF0aWMgWkVSTz1qZS5mcm9tSW50KDApO3N0YXRpYyBVWkVSTz1qZS5mcm9tSW50KDAsITApO3N0YXRpYyBPTkU9amUuZnJvbUludCgxKTtzdGF0aWMgVU9ORT1qZS5mcm9tSW50KDEsITApO3N0YXRpYyBORUdfT05FPWplLmZyb21JbnQoLTEpO3N0YXRpYyBNQVhfVkFMVUU9amUuZnJvbUJpdHMoLTEsMjE0NzQ4MzY0NywhMSk7c3RhdGljIE1JTl9WQUxVRT1qZS5mcm9tQml0cygwLC0yMTQ3NDgzNjQ4LCExKTtzdGF0aWMgZnJvbUJpdHMoZSx0LG4pe3JldHVybiBuZXcgamUoZSx0LG4pfXN0YXRpYyBmcm9tSW50KGUsdCl7bGV0IG4scixpO3JldHVybiB0PyhpPTA8PShlPj4+PTApJiZlPDI1NikmJihyPUFlW2VdLHIpP3I6KG49amUuZnJvbUJpdHMoZSwoMHxlKTwwPy0xOjAsITApLGkmJihBZVtlXT1uKSxuKTooaT0tMTI4PD0oZXw9MCkmJmU8MTI4KSYmKHI9TGVbZV0scik/cjoobj1qZS5mcm9tQml0cyhlLGU8MD8tMTowLCExKSxpJiYoTGVbZV09biksbil9c3RhdGljIGZyb21OdW1iZXIoZSx0KXtpZihpc05hTihlKSlyZXR1cm4gdD9qZS5VWkVSTzpqZS5aRVJPO2lmKHQpe2lmKGU8MClyZXR1cm4gamUuVVpFUk87aWYoZT49VGUpcmV0dXJuIGplLk1BWF9VTlNJR05FRF9WQUxVRX1lbHNle2lmKGU8PS0kZSlyZXR1cm4gamUuTUlOX1ZBTFVFO2lmKGUrMT49JGUpcmV0dXJuIGplLk1BWF9WQUxVRX1yZXR1cm4gZTwwP2plLmZyb21OdW1iZXIoLWUsdCkubmVnKCk6amUuZnJvbUJpdHMoZSV2ZXwwLGUvdmV8MCx0KX1zdGF0aWMgZnJvbUJpZ0ludChlLHQpe2NvbnN0IG49MHhmZmZmZmZmZm47cmV0dXJuIG5ldyBqZShOdW1iZXIoZSZuKSxOdW1iZXIoZT4+MzJuJm4pLHQpfXN0YXRpYyBfZnJvbVN0cmluZyhlLHQsbil7aWYoMD09PWUubGVuZ3RoKXRocm93IG5ldyBaKCJlbXB0eSBzdHJpbmciKTtpZihuPDJ8fDM2PG4pdGhyb3cgbmV3IFooInJhZGl4Iik7bGV0IHI7aWYoKHI9ZS5pbmRleE9mKCItIikpPjApdGhyb3cgbmV3IFooImludGVyaW9yIGh5cGhlbiIpO2lmKDA9PT1yKXJldHVybiBqZS5fZnJvbVN0cmluZyhlLnN1YnN0cmluZygxKSx0LG4pLm5lZygpO2NvbnN0IGk9amUuZnJvbU51bWJlcihNYXRoLnBvdyhuLDgpKTtsZXQgbz1qZS5aRVJPO2ZvcihsZXQgdD0wO3Q8ZS5sZW5ndGg7dCs9OCl7Y29uc3Qgcj1NYXRoLm1pbig4LGUubGVuZ3RoLXQpLHM9cGFyc2VJbnQoZS5zdWJzdHJpbmcodCx0K3IpLG4pO2lmKHI8OCl7Y29uc3QgZT1qZS5mcm9tTnVtYmVyKE1hdGgucG93KG4scikpO289by5tdWwoZSkuYWRkKGplLmZyb21OdW1iZXIocykpfWVsc2Ugbz1vLm11bChpKSxvPW8uYWRkKGplLmZyb21OdW1iZXIocykpfXJldHVybiBvLnVuc2lnbmVkPXQsb31zdGF0aWMgZnJvbVN0cmluZ1N0cmljdChlLHQsbil7bGV0IHI9ITE7aWYoIm51bWJlciI9PXR5cGVvZiB0PyhuPXQsdD0hMSk6cj0hIXQsbj8/PTEwLGUudHJpbSgpIT09ZSl0aHJvdyBuZXcgWihgSW5wdXQ6ICcke2V9JyBjb250YWlucyBsZWFkaW5nIGFuZC9vciB0cmFpbGluZyB3aGl0ZXNwYWNlYCk7aWYoIWZ1bmN0aW9uKGUsdCl7Y29uc3Qgbj0iMDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6Ii5zbGljZSgwLHQ9dD8/MTApO3JldHVybiFuZXcgUmVnRXhwKGBbXi0rJHtufV1gLCJpIikudGVzdChlKSYmZX0oZSxuKSl0aHJvdyBuZXcgWihgSW5wdXQ6ICcke2V9JyBjb250YWlucyBpbnZhbGlkIGNoYXJhY3RlcnMgZm9yIHJhZGl4OiAke259YCk7Y29uc3QgaT1OZShlKSxvPWplLl9mcm9tU3RyaW5nKGkscixuKTtpZihvLnRvU3RyaW5nKG4pLnRvTG93ZXJDYXNlKCkhPT1pLnRvTG93ZXJDYXNlKCkpdGhyb3cgbmV3IFooYElucHV0OiAke2V9IGlzIG5vdCByZXByZXNlbnRhYmxlIGFzICR7by51bnNpZ25lZD8iYW4gdW5zaWduZWQiOiJhIHNpZ25lZCJ9IDY0LWJpdCBMb25nICR7bnVsbCE9bj9gd2l0aCByYWRpeDogJHtufWA6IiJ9YCk7cmV0dXJuIG99c3RhdGljIGZyb21TdHJpbmcoZSx0LG4pe2xldCByPSExO3JldHVybiJudW1iZXIiPT10eXBlb2YgdD8obj10LHQ9ITEpOnI9ISF0LG4/Pz0xMCwiTmFOIj09PWUmJm48MjR8fCgiSW5maW5pdHkiPT09ZXx8IitJbmZpbml0eSI9PT1lfHwiLUluZmluaXR5Ij09PWUpJiZuPDM1P2plLlpFUk86amUuX2Zyb21TdHJpbmcoZSxyLG4pfXN0YXRpYyBmcm9tQnl0ZXMoZSx0LG4pe3JldHVybiBuP2plLmZyb21CeXRlc0xFKGUsdCk6amUuZnJvbUJ5dGVzQkUoZSx0KX1zdGF0aWMgZnJvbUJ5dGVzTEUoZSx0KXtyZXR1cm4gbmV3IGplKGVbMF18ZVsxXTw8OHxlWzJdPDwxNnxlWzNdPDwyNCxlWzRdfGVbNV08PDh8ZVs2XTw8MTZ8ZVs3XTw8MjQsdCl9c3RhdGljIGZyb21CeXRlc0JFKGUsdCl7cmV0dXJuIG5ldyBqZShlWzRdPDwyNHxlWzVdPDwxNnxlWzZdPDw4fGVbN10sZVswXTw8MjR8ZVsxXTw8MTZ8ZVsyXTw8OHxlWzNdLHQpfXN0YXRpYyBpc0xvbmcoZSl7cmV0dXJuIG51bGwhPWUmJiJvYmplY3QiPT10eXBlb2YgZSYmIl9faXNMb25nX18iaW4gZSYmITA9PT1lLl9faXNMb25nX199c3RhdGljIGZyb21WYWx1ZShlLHQpe3JldHVybiJudW1iZXIiPT10eXBlb2YgZT9qZS5mcm9tTnVtYmVyKGUsdCk6InN0cmluZyI9PXR5cGVvZiBlP2plLmZyb21TdHJpbmcoZSx0KTpqZS5mcm9tQml0cyhlLmxvdyxlLmhpZ2gsImJvb2xlYW4iPT10eXBlb2YgdD90OmUudW5zaWduZWQpfWFkZChlKXtqZS5pc0xvbmcoZSl8fChlPWplLmZyb21WYWx1ZShlKSk7Y29uc3QgdD10aGlzLmhpZ2g+Pj4xNixuPTY1NTM1JnRoaXMuaGlnaCxyPXRoaXMubG93Pj4+MTYsaT02NTUzNSZ0aGlzLmxvdyxvPWUuaGlnaD4+PjE2LHM9NjU1MzUmZS5oaWdoLGE9ZS5sb3c+Pj4xNjtsZXQgYz0wLGw9MCxmPTAsdT0wO3JldHVybiB1Kz1pKyg2NTUzNSZlLmxvdyksZis9dT4+PjE2LHUmPTY1NTM1LGYrPXIrYSxsKz1mPj4+MTYsZiY9NjU1MzUsbCs9bitzLGMrPWw+Pj4xNixsJj02NTUzNSxjKz10K28sYyY9NjU1MzUsamUuZnJvbUJpdHMoZjw8MTZ8dSxjPDwxNnxsLHRoaXMudW5zaWduZWQpfWFuZChlKXtyZXR1cm4gamUuaXNMb25nKGUpfHwoZT1qZS5mcm9tVmFsdWUoZSkpLGplLmZyb21CaXRzKHRoaXMubG93JmUubG93LHRoaXMuaGlnaCZlLmhpZ2gsdGhpcy51bnNpZ25lZCl9Y29tcGFyZShlKXtpZihqZS5pc0xvbmcoZSl8fChlPWplLmZyb21WYWx1ZShlKSksdGhpcy5lcShlKSlyZXR1cm4gMDtjb25zdCB0PXRoaXMuaXNOZWdhdGl2ZSgpLG49ZS5pc05lZ2F0aXZlKCk7cmV0dXJuIHQmJiFuPy0xOiF0JiZuPzE6dGhpcy51bnNpZ25lZD9lLmhpZ2g+Pj4wPnRoaXMuaGlnaD4+PjB8fGUuaGlnaD09PXRoaXMuaGlnaCYmZS5sb3c+Pj4wPnRoaXMubG93Pj4+MD8tMToxOnRoaXMuc3ViKGUpLmlzTmVnYXRpdmUoKT8tMToxfWNvbXAoZSl7cmV0dXJuIHRoaXMuY29tcGFyZShlKX1kaXZpZGUoZSl7aWYoamUuaXNMb25nKGUpfHwoZT1qZS5mcm9tVmFsdWUoZSkpLGUuaXNaZXJvKCkpdGhyb3cgbmV3IFooImRpdmlzaW9uIGJ5IHplcm8iKTtpZihJZSl7aWYoIXRoaXMudW5zaWduZWQmJi0yMTQ3NDgzNjQ4PT09dGhpcy5oaWdoJiYtMT09PWUubG93JiYtMT09PWUuaGlnaClyZXR1cm4gdGhpcztjb25zdCB0PSh0aGlzLnVuc2lnbmVkP0llLmRpdl91OkllLmRpdl9zKSh0aGlzLmxvdyx0aGlzLmhpZ2gsZS5sb3csZS5oaWdoKTtyZXR1cm4gamUuZnJvbUJpdHModCxJZS5nZXRfaGlnaCgpLHRoaXMudW5zaWduZWQpfWlmKHRoaXMuaXNaZXJvKCkpcmV0dXJuIHRoaXMudW5zaWduZWQ/amUuVVpFUk86amUuWkVSTztsZXQgdCxuLHI7aWYodGhpcy51bnNpZ25lZCl7aWYoZS51bnNpZ25lZHx8KGU9ZS50b1Vuc2lnbmVkKCkpLGUuZ3QodGhpcykpcmV0dXJuIGplLlVaRVJPO2lmKGUuZ3QodGhpcy5zaHJ1KDEpKSlyZXR1cm4gamUuVU9ORTtyPWplLlVaRVJPfWVsc2V7aWYodGhpcy5lcShqZS5NSU5fVkFMVUUpKXtpZihlLmVxKGplLk9ORSl8fGUuZXEoamUuTkVHX09ORSkpcmV0dXJuIGplLk1JTl9WQUxVRTtpZihlLmVxKGplLk1JTl9WQUxVRSkpcmV0dXJuIGplLk9ORTtyZXR1cm4gdD10aGlzLnNocigxKS5kaXYoZSkuc2hsKDEpLHQuZXEoamUuWkVSTyk/ZS5pc05lZ2F0aXZlKCk/amUuT05FOmplLk5FR19PTkU6KG49dGhpcy5zdWIoZS5tdWwodCkpLHI9dC5hZGQobi5kaXYoZSkpLHIpfWlmKGUuZXEoamUuTUlOX1ZBTFVFKSlyZXR1cm4gdGhpcy51bnNpZ25lZD9qZS5VWkVSTzpqZS5aRVJPO2lmKHRoaXMuaXNOZWdhdGl2ZSgpKXJldHVybiBlLmlzTmVnYXRpdmUoKT90aGlzLm5lZygpLmRpdihlLm5lZygpKTp0aGlzLm5lZygpLmRpdihlKS5uZWcoKTtpZihlLmlzTmVnYXRpdmUoKSlyZXR1cm4gdGhpcy5kaXYoZS5uZWcoKSkubmVnKCk7cj1qZS5aRVJPfWZvcihuPXRoaXM7bi5ndGUoZSk7KXt0PU1hdGgubWF4KDEsTWF0aC5mbG9vcihuLnRvTnVtYmVyKCkvZS50b051bWJlcigpKSk7Y29uc3QgaT1NYXRoLmNlaWwoTWF0aC5sb2codCkvTWF0aC5MTjIpLG89aTw9NDg/MTpNYXRoLnBvdygyLGktNDgpO2xldCBzPWplLmZyb21OdW1iZXIodCksYT1zLm11bChlKTtmb3IoO2EuaXNOZWdhdGl2ZSgpfHxhLmd0KG4pOyl0LT1vLHM9amUuZnJvbU51bWJlcih0LHRoaXMudW5zaWduZWQpLGE9cy5tdWwoZSk7cy5pc1plcm8oKSYmKHM9amUuT05FKSxyPXIuYWRkKHMpLG49bi5zdWIoYSl9cmV0dXJuIHJ9ZGl2KGUpe3JldHVybiB0aGlzLmRpdmlkZShlKX1lcXVhbHMoZSl7cmV0dXJuIGplLmlzTG9uZyhlKXx8KGU9amUuZnJvbVZhbHVlKGUpKSwodGhpcy51bnNpZ25lZD09PWUudW5zaWduZWR8fHRoaXMuaGlnaD4+PjMxIT0xfHxlLmhpZ2g+Pj4zMSE9MSkmJih0aGlzLmhpZ2g9PT1lLmhpZ2gmJnRoaXMubG93PT09ZS5sb3cpfWVxKGUpe3JldHVybiB0aGlzLmVxdWFscyhlKX1nZXRIaWdoQml0cygpe3JldHVybiB0aGlzLmhpZ2h9Z2V0SGlnaEJpdHNVbnNpZ25lZCgpe3JldHVybiB0aGlzLmhpZ2g+Pj4wfWdldExvd0JpdHMoKXtyZXR1cm4gdGhpcy5sb3d9Z2V0TG93Qml0c1Vuc2lnbmVkKCl7cmV0dXJuIHRoaXMubG93Pj4+MH1nZXROdW1CaXRzQWJzKCl7aWYodGhpcy5pc05lZ2F0aXZlKCkpcmV0dXJuIHRoaXMuZXEoamUuTUlOX1ZBTFVFKT82NDp0aGlzLm5lZygpLmdldE51bUJpdHNBYnMoKTtjb25zdCBlPTAhPT10aGlzLmhpZ2g/dGhpcy5oaWdoOnRoaXMubG93O2xldCB0O2Zvcih0PTMxO3Q+MCYmIShlJjE8PHQpO3QtLSk7cmV0dXJuIDAhPT10aGlzLmhpZ2g/dCszMzp0KzF9Z3JlYXRlclRoYW4oZSl7cmV0dXJuIHRoaXMuY29tcChlKT4wfWd0KGUpe3JldHVybiB0aGlzLmdyZWF0ZXJUaGFuKGUpfWdyZWF0ZXJUaGFuT3JFcXVhbChlKXtyZXR1cm4gdGhpcy5jb21wKGUpPj0wfWd0ZShlKXtyZXR1cm4gdGhpcy5ncmVhdGVyVGhhbk9yRXF1YWwoZSl9Z2UoZSl7cmV0dXJuIHRoaXMuZ3JlYXRlclRoYW5PckVxdWFsKGUpfWlzRXZlbigpe3JldHVybiEoMSZ0aGlzLmxvdyl9aXNOZWdhdGl2ZSgpe3JldHVybiF0aGlzLnVuc2lnbmVkJiZ0aGlzLmhpZ2g8MH1pc09kZCgpe3JldHVybiEoMSZ+dGhpcy5sb3cpfWlzUG9zaXRpdmUoKXtyZXR1cm4gdGhpcy51bnNpZ25lZHx8dGhpcy5oaWdoPj0wfWlzWmVybygpe3JldHVybiAwPT09dGhpcy5oaWdoJiYwPT09dGhpcy5sb3d9bGVzc1RoYW4oZSl7cmV0dXJuIHRoaXMuY29tcChlKTwwfWx0KGUpe3JldHVybiB0aGlzLmxlc3NUaGFuKGUpfWxlc3NUaGFuT3JFcXVhbChlKXtyZXR1cm4gdGhpcy5jb21wKGUpPD0wfWx0ZShlKXtyZXR1cm4gdGhpcy5sZXNzVGhhbk9yRXF1YWwoZSl9bW9kdWxvKGUpe2lmKGplLmlzTG9uZyhlKXx8KGU9amUuZnJvbVZhbHVlKGUpKSxJZSl7Y29uc3QgdD0odGhpcy51bnNpZ25lZD9JZS5yZW1fdTpJZS5yZW1fcykodGhpcy5sb3csdGhpcy5oaWdoLGUubG93LGUuaGlnaCk7cmV0dXJuIGplLmZyb21CaXRzKHQsSWUuZ2V0X2hpZ2goKSx0aGlzLnVuc2lnbmVkKX1yZXR1cm4gdGhpcy5zdWIodGhpcy5kaXYoZSkubXVsKGUpKX1tb2QoZSl7cmV0dXJuIHRoaXMubW9kdWxvKGUpfXJlbShlKXtyZXR1cm4gdGhpcy5tb2R1bG8oZSl9bXVsdGlwbHkoZSl7aWYodGhpcy5pc1plcm8oKSlyZXR1cm4gamUuWkVSTztpZihqZS5pc0xvbmcoZSl8fChlPWplLmZyb21WYWx1ZShlKSksSWUpe2NvbnN0IHQ9SWUubXVsKHRoaXMubG93LHRoaXMuaGlnaCxlLmxvdyxlLmhpZ2gpO3JldHVybiBqZS5mcm9tQml0cyh0LEllLmdldF9oaWdoKCksdGhpcy51bnNpZ25lZCl9aWYoZS5pc1plcm8oKSlyZXR1cm4gamUuWkVSTztpZih0aGlzLmVxKGplLk1JTl9WQUxVRSkpcmV0dXJuIGUuaXNPZGQoKT9qZS5NSU5fVkFMVUU6amUuWkVSTztpZihlLmVxKGplLk1JTl9WQUxVRSkpcmV0dXJuIHRoaXMuaXNPZGQoKT9qZS5NSU5fVkFMVUU6amUuWkVSTztpZih0aGlzLmlzTmVnYXRpdmUoKSlyZXR1cm4gZS5pc05lZ2F0aXZlKCk/dGhpcy5uZWcoKS5tdWwoZS5uZWcoKSk6dGhpcy5uZWcoKS5tdWwoZSkubmVnKCk7aWYoZS5pc05lZ2F0aXZlKCkpcmV0dXJuIHRoaXMubXVsKGUubmVnKCkpLm5lZygpO2lmKHRoaXMubHQoamUuVFdPX1BXUl8yNCkmJmUubHQoamUuVFdPX1BXUl8yNCkpcmV0dXJuIGplLmZyb21OdW1iZXIodGhpcy50b051bWJlcigpKmUudG9OdW1iZXIoKSx0aGlzLnVuc2lnbmVkKTtjb25zdCB0PXRoaXMuaGlnaD4+PjE2LG49NjU1MzUmdGhpcy5oaWdoLHI9dGhpcy5sb3c+Pj4xNixpPTY1NTM1JnRoaXMubG93LG89ZS5oaWdoPj4+MTYscz02NTUzNSZlLmhpZ2gsYT1lLmxvdz4+PjE2LGM9NjU1MzUmZS5sb3c7bGV0IGw9MCxmPTAsdT0wLF89MDtyZXR1cm4gXys9aSpjLHUrPV8+Pj4xNixfJj02NTUzNSx1Kz1yKmMsZis9dT4+PjE2LHUmPTY1NTM1LHUrPWkqYSxmKz11Pj4+MTYsdSY9NjU1MzUsZis9bipjLGwrPWY+Pj4xNixmJj02NTUzNSxmKz1yKmEsbCs9Zj4+PjE2LGYmPTY1NTM1LGYrPWkqcyxsKz1mPj4+MTYsZiY9NjU1MzUsbCs9dCpjK24qYStyKnMraSpvLGwmPTY1NTM1LGplLmZyb21CaXRzKHU8PDE2fF8sbDw8MTZ8Zix0aGlzLnVuc2lnbmVkKX1tdWwoZSl7cmV0dXJuIHRoaXMubXVsdGlwbHkoZSl9bmVnYXRlKCl7cmV0dXJuIXRoaXMudW5zaWduZWQmJnRoaXMuZXEoamUuTUlOX1ZBTFVFKT9qZS5NSU5fVkFMVUU6dGhpcy5ub3QoKS5hZGQoamUuT05FKX1uZWcoKXtyZXR1cm4gdGhpcy5uZWdhdGUoKX1ub3QoKXtyZXR1cm4gamUuZnJvbUJpdHMofnRoaXMubG93LH50aGlzLmhpZ2gsdGhpcy51bnNpZ25lZCl9bm90RXF1YWxzKGUpe3JldHVybiF0aGlzLmVxdWFscyhlKX1uZXEoZSl7cmV0dXJuIHRoaXMubm90RXF1YWxzKGUpfW5lKGUpe3JldHVybiB0aGlzLm5vdEVxdWFscyhlKX1vcihlKXtyZXR1cm4gamUuaXNMb25nKGUpfHwoZT1qZS5mcm9tVmFsdWUoZSkpLGplLmZyb21CaXRzKHRoaXMubG93fGUubG93LHRoaXMuaGlnaHxlLmhpZ2gsdGhpcy51bnNpZ25lZCl9c2hpZnRMZWZ0KGUpe3JldHVybiBqZS5pc0xvbmcoZSkmJihlPWUudG9JbnQoKSksMD09KGUmPTYzKT90aGlzOmU8MzI/amUuZnJvbUJpdHModGhpcy5sb3c8PGUsdGhpcy5oaWdoPDxlfHRoaXMubG93Pj4+MzItZSx0aGlzLnVuc2lnbmVkKTpqZS5mcm9tQml0cygwLHRoaXMubG93PDxlLTMyLHRoaXMudW5zaWduZWQpfXNobChlKXtyZXR1cm4gdGhpcy5zaGlmdExlZnQoZSl9c2hpZnRSaWdodChlKXtyZXR1cm4gamUuaXNMb25nKGUpJiYoZT1lLnRvSW50KCkpLDA9PShlJj02Myk/dGhpczplPDMyP2plLmZyb21CaXRzKHRoaXMubG93Pj4+ZXx0aGlzLmhpZ2g8PDMyLWUsdGhpcy5oaWdoPj5lLHRoaXMudW5zaWduZWQpOmplLmZyb21CaXRzKHRoaXMuaGlnaD4+ZS0zMix0aGlzLmhpZ2g+PTA/MDotMSx0aGlzLnVuc2lnbmVkKX1zaHIoZSl7cmV0dXJuIHRoaXMuc2hpZnRSaWdodChlKX1zaGlmdFJpZ2h0VW5zaWduZWQoZSl7aWYoamUuaXNMb25nKGUpJiYoZT1lLnRvSW50KCkpLDA9PT0oZSY9NjMpKXJldHVybiB0aGlzO3tjb25zdCB0PXRoaXMuaGlnaDtpZihlPDMyKXtjb25zdCBuPXRoaXMubG93O3JldHVybiBqZS5mcm9tQml0cyhuPj4+ZXx0PDwzMi1lLHQ+Pj5lLHRoaXMudW5zaWduZWQpfXJldHVybiAzMj09PWU/amUuZnJvbUJpdHModCwwLHRoaXMudW5zaWduZWQpOmplLmZyb21CaXRzKHQ+Pj5lLTMyLDAsdGhpcy51bnNpZ25lZCl9fXNocl91KGUpe3JldHVybiB0aGlzLnNoaWZ0UmlnaHRVbnNpZ25lZChlKX1zaHJ1KGUpe3JldHVybiB0aGlzLnNoaWZ0UmlnaHRVbnNpZ25lZChlKX1zdWJ0cmFjdChlKXtyZXR1cm4gamUuaXNMb25nKGUpfHwoZT1qZS5mcm9tVmFsdWUoZSkpLHRoaXMuYWRkKGUubmVnKCkpfXN1YihlKXtyZXR1cm4gdGhpcy5zdWJ0cmFjdChlKX10b0ludCgpe3JldHVybiB0aGlzLnVuc2lnbmVkP3RoaXMubG93Pj4+MDp0aGlzLmxvd310b051bWJlcigpe3JldHVybiB0aGlzLnVuc2lnbmVkPyh0aGlzLmhpZ2g+Pj4wKSp2ZSsodGhpcy5sb3c+Pj4wKTp0aGlzLmhpZ2gqdmUrKHRoaXMubG93Pj4+MCl9dG9CaWdJbnQoKXtyZXR1cm4gQmlnSW50KHRoaXMudG9TdHJpbmcoKSl9dG9CeXRlcyhlKXtyZXR1cm4gZT90aGlzLnRvQnl0ZXNMRSgpOnRoaXMudG9CeXRlc0JFKCl9dG9CeXRlc0xFKCl7Y29uc3QgZT10aGlzLmhpZ2gsdD10aGlzLmxvdztyZXR1cm5bMjU1JnQsdD4+PjgmMjU1LHQ+Pj4xNiYyNTUsdD4+PjI0LDI1NSZlLGU+Pj44JjI1NSxlPj4+MTYmMjU1LGU+Pj4yNF19dG9CeXRlc0JFKCl7Y29uc3QgZT10aGlzLmhpZ2gsdD10aGlzLmxvdztyZXR1cm5bZT4+PjI0LGU+Pj4xNiYyNTUsZT4+PjgmMjU1LDI1NSZlLHQ+Pj4yNCx0Pj4+MTYmMjU1LHQ+Pj44JjI1NSwyNTUmdF19dG9TaWduZWQoKXtyZXR1cm4gdGhpcy51bnNpZ25lZD9qZS5mcm9tQml0cyh0aGlzLmxvdyx0aGlzLmhpZ2gsITEpOnRoaXN9dG9TdHJpbmcoZSl7aWYoKGU9ZXx8MTApPDJ8fDM2PGUpdGhyb3cgbmV3IFooInJhZGl4Iik7aWYodGhpcy5pc1plcm8oKSlyZXR1cm4iMCI7aWYodGhpcy5pc05lZ2F0aXZlKCkpe2lmKHRoaXMuZXEoamUuTUlOX1ZBTFVFKSl7Y29uc3QgdD1qZS5mcm9tTnVtYmVyKGUpLG49dGhpcy5kaXYodCkscj1uLm11bCh0KS5zdWIodGhpcyk7cmV0dXJuIG4udG9TdHJpbmcoZSkrci50b0ludCgpLnRvU3RyaW5nKGUpfXJldHVybiItIit0aGlzLm5lZygpLnRvU3RyaW5nKGUpfWNvbnN0IHQ9amUuZnJvbU51bWJlcihNYXRoLnBvdyhlLDYpLHRoaXMudW5zaWduZWQpO2xldCBuPXRoaXMscj0iIjtmb3IoOzspe2NvbnN0IGk9bi5kaXYodCk7bGV0IG89KG4uc3ViKGkubXVsKHQpKS50b0ludCgpPj4+MCkudG9TdHJpbmcoZSk7aWYobj1pLG4uaXNaZXJvKCkpcmV0dXJuIG8rcjtmb3IoO28ubGVuZ3RoPDY7KW89IjAiK287cj0iIitvK3J9fXRvVW5zaWduZWQoKXtyZXR1cm4gdGhpcy51bnNpZ25lZD90aGlzOmplLmZyb21CaXRzKHRoaXMubG93LHRoaXMuaGlnaCwhMCl9eG9yKGUpe3JldHVybiBqZS5pc0xvbmcoZSl8fChlPWplLmZyb21WYWx1ZShlKSksamUuZnJvbUJpdHModGhpcy5sb3deZS5sb3csdGhpcy5oaWdoXmUuaGlnaCx0aGlzLnVuc2lnbmVkKX1lcXooKXtyZXR1cm4gdGhpcy5pc1plcm8oKX1sZShlKXtyZXR1cm4gdGhpcy5sZXNzVGhhbk9yRXF1YWwoZSl9dG9FeHRlbmRlZEpTT04oZSl7cmV0dXJuIGUmJmUucmVsYXhlZD90aGlzLnRvTnVtYmVyKCk6eyRudW1iZXJMb25nOnRoaXMudG9TdHJpbmcoKX19c3RhdGljIGZyb21FeHRlbmRlZEpTT04oZSx0KXtjb25zdHt1c2VCaWdJbnQ2NDpuPSExLHJlbGF4ZWQ6cj0hMH09ey4uLnR9O2lmKGUuJG51bWJlckxvbmcubGVuZ3RoPjIwKXRocm93IG5ldyBaKCIkbnVtYmVyTG9uZyBzdHJpbmcgaXMgdG9vIGxvbmciKTtpZighUmUudGVzdChlLiRudW1iZXJMb25nKSl0aHJvdyBuZXcgWihgJG51bWJlckxvbmcgc3RyaW5nICIke2UuJG51bWJlckxvbmd9IiBpcyBpbiBhbiBpbnZhbGlkIGZvcm1hdGApO2lmKG4pe2NvbnN0IHQ9QmlnSW50KGUuJG51bWJlckxvbmcpO3JldHVybiBCaWdJbnQuYXNJbnROKDY0LHQpfWNvbnN0IGk9amUuZnJvbVN0cmluZyhlLiRudW1iZXJMb25nKTtyZXR1cm4gcj9pLnRvTnVtYmVyKCk6aX1pbnNwZWN0KGUsdCxuKXtuPz89dztyZXR1cm5gbmV3IExvbmcoJHtuKHRoaXMudG9TdHJpbmcoKSx0KX0ke3RoaXMudW5zaWduZWQ/YCwgJHtuKHRoaXMudW5zaWduZWQsdCl9YDoiIn0pYH19Y29uc3QgRmU9L14oXCt8LSk/KFxkK3woXGQqXC5cZCopKT8oRXxlKT8oWy0rXSk/KFxkKyk/JC8sa2U9L14oXCt8LSk/KEluZmluaXR5fGluZikkL2ksemU9L14oXCt8LSk/TmFOJC9pLERlPTYxMTEsQ2U9LTYxNzYsTWU9X2UuZnJvbU51bWJlckFycmF5KFsxMjQsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDBdLnJldmVyc2UoKSksVmU9X2UuZnJvbU51bWJlckFycmF5KFsyNDgsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDBdLnJldmVyc2UoKSksUGU9X2UuZnJvbU51bWJlckFycmF5KFsxMjAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDBdLnJldmVyc2UoKSksSmU9L14oWy0rXSk/KFxkKyk/JC87ZnVuY3Rpb24gV2UoZSl7cmV0dXJuIWlzTmFOKHBhcnNlSW50KGUsMTApKX1mdW5jdGlvbiBZZShlKXtjb25zdCB0PWplLmZyb21OdW1iZXIoMWU5KTtsZXQgbj1qZS5mcm9tTnVtYmVyKDApO2lmKCEoZS5wYXJ0c1swXXx8ZS5wYXJ0c1sxXXx8ZS5wYXJ0c1syXXx8ZS5wYXJ0c1szXSkpcmV0dXJue3F1b3RpZW50OmUscmVtOm59O2ZvcihsZXQgcj0wO3I8PTM7cisrKW49bi5zaGlmdExlZnQoMzIpLG49bi5hZGQobmV3IGplKGUucGFydHNbcl0sMCkpLGUucGFydHNbcl09bi5kaXYodCkubG93LG49bi5tb2R1bG8odCk7cmV0dXJue3F1b3RpZW50OmUscmVtOm59fWZ1bmN0aW9uIHFlKGUsdCl7dGhyb3cgbmV3IFooYCIke2V9IiBpcyBub3QgYSB2YWxpZCBEZWNpbWFsMTI4IHN0cmluZyAtICR7dH1gKX1jbGFzcyBIZSBleHRlbmRzIGhle2dldCBfYnNvbnR5cGUoKXtyZXR1cm4iRGVjaW1hbDEyOCJ9Ynl0ZXM7Y29uc3RydWN0b3IoZSl7aWYoc3VwZXIoKSwic3RyaW5nIj09dHlwZW9mIGUpdGhpcy5ieXRlcz1IZS5mcm9tU3RyaW5nKGUpLmJ5dGVzO2Vsc2V7aWYoIShlIGluc3RhbmNlb2YgVWludDhBcnJheXx8XyhlKSkpdGhyb3cgbmV3IFooIkRlY2ltYWwxMjggbXVzdCB0YWtlIGEgQnVmZmVyIG9yIHN0cmluZyIpO2lmKDE2IT09ZS5ieXRlTGVuZ3RoKXRocm93IG5ldyBaKCJEZWNpbWFsMTI4IG11c3QgdGFrZSBhIEJ1ZmZlciBvZiAxNiBieXRlcyIpO3RoaXMuYnl0ZXM9ZX19c3RhdGljIGZyb21TdHJpbmcoZSl7cmV0dXJuIEhlLl9mcm9tU3RyaW5nKGUse2FsbG93Um91bmRpbmc6ITF9KX1zdGF0aWMgZnJvbVN0cmluZ1dpdGhSb3VuZGluZyhlKXtyZXR1cm4gSGUuX2Zyb21TdHJpbmcoZSx7YWxsb3dSb3VuZGluZzohMH0pfXN0YXRpYyBfZnJvbVN0cmluZyhlLHQpe2xldCBuPSExLHI9ITEsaT0hMSxvPSExLHM9MCxhPTAsYz0wLGw9MCxmPTA7Y29uc3QgdT1bMF07bGV0IF89MCxnPTAsaD0wLGI9MCxkPW5ldyBqZSgwLDApLHc9bmV3IGplKDAsMCkscD0wLHk9MDtpZihlLmxlbmd0aD49N2UzKXRocm93IG5ldyBaKGUrIiBub3QgYSB2YWxpZCBEZWNpbWFsMTI4IHN0cmluZyIpO2NvbnN0IG09ZS5tYXRjaChGZSksUz1lLm1hdGNoKGtlKSxCPWUubWF0Y2goemUpO2lmKCFtJiYhUyYmIUJ8fDA9PT1lLmxlbmd0aCl0aHJvdyBuZXcgWihlKyIgbm90IGEgdmFsaWQgRGVjaW1hbDEyOCBzdHJpbmciKTtpZihtKXtjb25zdCB0PW1bMl0sbj1tWzRdLHI9bVs1XSxpPW1bNl07biYmdm9pZCAwPT09aSYmcWUoZSwibWlzc2luZyBleHBvbmVudCBwb3dlciIpLG4mJnZvaWQgMD09PXQmJnFlKGUsIm1pc3NpbmcgZXhwb25lbnQgYmFzZSIpLHZvaWQgMD09PW4mJihyfHxpKSYmcWUoZSwibWlzc2luZyBlIGJlZm9yZSBleHBvbmVudCIpfWlmKCIrIiE9PWVbeV0mJiItIiE9PWVbeV18fChyPSEwLG49Ii0iPT09ZVt5KytdKSwhV2UoZVt5XSkmJiIuIiE9PWVbeV0pe2lmKCJpIj09PWVbeV18fCJJIj09PWVbeV0pcmV0dXJuIG5ldyBIZShuP1ZlOlBlKTtpZigiTiI9PT1lW3ldKXJldHVybiBuZXcgSGUoTWUpfWZvcig7V2UoZVt5XSl8fCIuIj09PWVbeV07KSIuIiE9PWVbeV0/KF88MzQmJigiMCIhPT1lW3ldfHxvKSYmKG98fChmPWEpLG89ITAsdVtnKytdPXBhcnNlSW50KGVbeV0sMTApLF8rPTEpLG8mJihjKz0xKSxpJiYobCs9MSksYSs9MSx5Kz0xKTooaSYmcWUoZSwiY29udGFpbnMgbXVsdGlwbGUgcGVyaW9kcyIpLGk9ITAseSs9MSk7aWYoaSYmIWEpdGhyb3cgbmV3IFooZSsiIG5vdCBhIHZhbGlkIERlY2ltYWwxMjggc3RyaW5nIik7aWYoImUiPT09ZVt5XXx8IkUiPT09ZVt5XSl7Y29uc3QgdD1lLnN1YnN0cigrK3kpLm1hdGNoKEplKTtpZighdHx8IXRbMl0pcmV0dXJuIG5ldyBIZShNZSk7Yj1wYXJzZUludCh0WzBdLDEwKSx5Kz10WzBdLmxlbmd0aH1pZihlW3ldKXJldHVybiBuZXcgSGUoTWUpO2lmKF8pe2lmKGg9Xy0xLHM9YywxIT09cylmb3IoOyIwIj09PWVbZitzLTErTnVtYmVyKHIpK051bWJlcihpKV07KXMtPTF9ZWxzZSB1WzBdPTAsYz0xLF89MSxzPTA7Zm9yKGI8PWwmJmw+YisxNjM4ND9iPUNlOmItPWw7Yj5EZTspe2lmKGgrPTEsaD49MzQpe2lmKDA9PT1zKXtiPURlO2JyZWFrfXFlKGUsIm92ZXJmbG93Iil9Yi09MX1pZih0LmFsbG93Um91bmRpbmcpe2Zvcig7YjxDZXx8XzxjOyl7aWYoMD09PWgmJnM8Xyl7Yj1DZSxzPTA7YnJlYWt9aWYoXzxjP2MtPTE6aC09MSxiPERlKWIrPTE7ZWxzZXtpZih1LmpvaW4oIiIpLm1hdGNoKC9eMCskLykpe2I9RGU7YnJlYWt9cWUoZSwib3ZlcmZsb3ciKX19aWYoaCsxPHMpe2xldCB0PWE7aSYmKGYrPTEsdCs9MSksciYmKGYrPTEsdCs9MSk7Y29uc3Qgbz1wYXJzZUludChlW2YraCsxXSwxMCk7bGV0IHM9MDtpZihvPj01JiYocz0xLDU9PT1vKSl7cz11W2hdJTI9PTE/MTowO2ZvcihsZXQgbj1mK2grMjtuPHQ7bisrKWlmKHBhcnNlSW50KGVbbl0sMTApKXtzPTE7YnJlYWt9fWlmKHMpe2xldCBlPWg7Zm9yKDtlPj0wJiYrK3VbZV0+OTtlLS0paWYodVtlXT0wLDA9PT1lKXtpZighKGI8RGUpKXJldHVybiBuZXcgSGUobj9WZTpQZSk7Yis9MSx1W2VdPTF9fX19ZWxzZXtmb3IoO2I8Q2V8fF88Yzspe2lmKDA9PT1oKXtpZigwPT09cyl7Yj1DZTticmVha31xZShlLCJleHBvbmVudCB1bmRlcmZsb3ciKX1fPGM/KCIwIiE9PWVbYy0xK051bWJlcihyKStOdW1iZXIoaSldJiYwIT09cyYmcWUoZSwiaW5leGFjdCByb3VuZGluZyIpLGMtPTEpOigwIT09dVtoXSYmcWUoZSwiaW5leGFjdCByb3VuZGluZyIpLGgtPTEpLGI8RGU/Yis9MTpxZShlLCJvdmVyZmxvdyIpfWlmKGgrMTxzKXtpJiYoZis9MSksciYmKGYrPTEpOzAhPT1wYXJzZUludChlW2YraCsxXSwxMCkmJnFlKGUsImluZXhhY3Qgcm91bmRpbmciKX19aWYoZD1qZS5mcm9tTnVtYmVyKDApLHc9amUuZnJvbU51bWJlcigwKSwwPT09cylkPWplLmZyb21OdW1iZXIoMCksdz1qZS5mcm9tTnVtYmVyKDApO2Vsc2UgaWYoaDwxNyl7bGV0IGU9MDtmb3Iodz1qZS5mcm9tTnVtYmVyKHVbZSsrXSksZD1uZXcgamUoMCwwKTtlPD1oO2UrKyl3PXcubXVsdGlwbHkoamUuZnJvbU51bWJlcigxMCkpLHc9dy5hZGQoamUuZnJvbU51bWJlcih1W2VdKSl9ZWxzZXtsZXQgZT0wO2ZvcihkPWplLmZyb21OdW1iZXIodVtlKytdKTtlPD1oLTE3O2UrKylkPWQubXVsdGlwbHkoamUuZnJvbU51bWJlcigxMCkpLGQ9ZC5hZGQoamUuZnJvbU51bWJlcih1W2VdKSk7Zm9yKHc9amUuZnJvbU51bWJlcih1W2UrK10pO2U8PWg7ZSsrKXc9dy5tdWx0aXBseShqZS5mcm9tTnVtYmVyKDEwKSksdz13LmFkZChqZS5mcm9tTnVtYmVyKHVbZV0pKX1jb25zdCB4PWZ1bmN0aW9uKGUsdCl7aWYoIWUmJiF0KXJldHVybntoaWdoOmplLmZyb21OdW1iZXIoMCksbG93OmplLmZyb21OdW1iZXIoMCl9O2NvbnN0IG49ZS5zaGlmdFJpZ2h0VW5zaWduZWQoMzIpLHI9bmV3IGplKGUuZ2V0TG93Qml0cygpLDApLGk9dC5zaGlmdFJpZ2h0VW5zaWduZWQoMzIpLG89bmV3IGplKHQuZ2V0TG93Qml0cygpLDApO2xldCBzPW4ubXVsdGlwbHkoaSksYT1uLm11bHRpcGx5KG8pO2NvbnN0IGM9ci5tdWx0aXBseShpKTtsZXQgbD1yLm11bHRpcGx5KG8pO3JldHVybiBzPXMuYWRkKGEuc2hpZnRSaWdodFVuc2lnbmVkKDMyKSksYT1uZXcgamUoYS5nZXRMb3dCaXRzKCksMCkuYWRkKGMpLmFkZChsLnNoaWZ0UmlnaHRVbnNpZ25lZCgzMikpLHM9cy5hZGQoYS5zaGlmdFJpZ2h0VW5zaWduZWQoMzIpKSxsPWEuc2hpZnRMZWZ0KDMyKS5hZGQobmV3IGplKGwuZ2V0TG93Qml0cygpLDApKSx7aGlnaDpzLGxvdzpsfX0oZCxqZS5mcm9tU3RyaW5nKCIxMDAwMDAwMDAwMDAwMDAwMDAiKSk7eC5sb3c9eC5sb3cuYWRkKHcpLGZ1bmN0aW9uKGUsdCl7Y29uc3Qgbj1lLmhpZ2g+Pj4wLHI9dC5oaWdoPj4+MDtpZihuPHIpcmV0dXJuITA7aWYobj09PXImJmUubG93Pj4+MDx0Lmxvdz4+PjApcmV0dXJuITA7cmV0dXJuITF9KHgubG93LHcpJiYoeC5oaWdoPXguaGlnaC5hZGQoamUuZnJvbU51bWJlcigxKSkpLHA9Yis2MTc2O2NvbnN0IEU9e2xvdzpqZS5mcm9tTnVtYmVyKDApLGhpZ2g6amUuZnJvbU51bWJlcigwKX07eC5oaWdoLnNoaWZ0UmlnaHRVbnNpZ25lZCg0OSkuYW5kKGplLmZyb21OdW1iZXIoMSkpLmVxdWFscyhqZS5mcm9tTnVtYmVyKDEpKT8oRS5oaWdoPUUuaGlnaC5vcihqZS5mcm9tTnVtYmVyKDMpLnNoaWZ0TGVmdCg2MSkpLEUuaGlnaD1FLmhpZ2gub3IoamUuZnJvbU51bWJlcihwKS5hbmQoamUuZnJvbU51bWJlcigxNjM4Mykuc2hpZnRMZWZ0KDQ3KSkpLEUuaGlnaD1FLmhpZ2gub3IoeC5oaWdoLmFuZChqZS5mcm9tTnVtYmVyKDB4N2ZmZmZmZmZmZmZmKSkpKTooRS5oaWdoPUUuaGlnaC5vcihqZS5mcm9tTnVtYmVyKDE2MzgzJnApLnNoaWZ0TGVmdCg0OSkpLEUuaGlnaD1FLmhpZ2gub3IoeC5oaWdoLmFuZChqZS5mcm9tTnVtYmVyKDU2Mjk0OTk1MzQyMTMxMSkpKSksRS5sb3c9eC5sb3csbiYmKEUuaGlnaD1FLmhpZ2gub3IoamUuZnJvbVN0cmluZygiOTIyMzM3MjAzNjg1NDc3NTgwOCIpKSk7Y29uc3QgVT1fZS5hbGxvY2F0ZVVuc2FmZSgxNik7cmV0dXJuIHk9MCxVW3krK109MjU1JkUubG93LmxvdyxVW3krK109RS5sb3cubG93Pj44JjI1NSxVW3krK109RS5sb3cubG93Pj4xNiYyNTUsVVt5KytdPUUubG93Lmxvdz4+MjQmMjU1LFVbeSsrXT0yNTUmRS5sb3cuaGlnaCxVW3krK109RS5sb3cuaGlnaD4+OCYyNTUsVVt5KytdPUUubG93LmhpZ2g+PjE2JjI1NSxVW3krK109RS5sb3cuaGlnaD4+MjQmMjU1LFVbeSsrXT0yNTUmRS5oaWdoLmxvdyxVW3krK109RS5oaWdoLmxvdz4+OCYyNTUsVVt5KytdPUUuaGlnaC5sb3c+PjE2JjI1NSxVW3krK109RS5oaWdoLmxvdz4+MjQmMjU1LFVbeSsrXT0yNTUmRS5oaWdoLmhpZ2gsVVt5KytdPUUuaGlnaC5oaWdoPj44JjI1NSxVW3krK109RS5oaWdoLmhpZ2g+PjE2JjI1NSxVW3krK109RS5oaWdoLmhpZ2g+PjI0JjI1NSxuZXcgSGUoVSl9dG9TdHJpbmcoKXtsZXQgZSx0PTA7Y29uc3Qgbj1uZXcgQXJyYXkoMzYpO2ZvcihsZXQgZT0wO2U8bi5sZW5ndGg7ZSsrKW5bZV09MDtsZXQgcixpLG8scz0wLGE9ITEsYz17cGFydHM6WzAsMCwwLDBdfTtjb25zdCBsPVtdO3M9MDtjb25zdCBmPXRoaXMuYnl0ZXMsdT1mW3MrK118ZltzKytdPDw4fGZbcysrXTw8MTZ8ZltzKytdPDwyNCxfPWZbcysrXXxmW3MrK108PDh8ZltzKytdPDwxNnxmW3MrK108PDI0LGc9ZltzKytdfGZbcysrXTw8OHxmW3MrK108PDE2fGZbcysrXTw8MjQsaD1mW3MrK118ZltzKytdPDw4fGZbcysrXTw8MTZ8ZltzKytdPDwyNDtzPTA7KHtsb3c6bmV3IGplKHUsXyksaGlnaDpuZXcgamUoZyxoKX0pLmhpZ2gubGVzc1RoYW4oamUuWkVSTykmJmwucHVzaCgiLSIpO2NvbnN0IGI9aD4+MjYmMzE7aWYoYj4+Mz09Myl7aWYoMzA9PT1iKXJldHVybiBsLmpvaW4oIiIpKyJJbmZpbml0eSI7aWYoMzE9PT1iKXJldHVybiJOYU4iO2U9aD4+MTUmMTYzODMscj04KyhoPj4xNCYxKX1lbHNlIHI9aD4+MTQmNyxlPWg+PjE3JjE2MzgzO2NvbnN0IGQ9ZS02MTc2O2lmKGMucGFydHNbMF09KDE2MzgzJmgpKygoMTUmcik8PDE0KSxjLnBhcnRzWzFdPWcsYy5wYXJ0c1syXT1fLGMucGFydHNbM109dSwwPT09Yy5wYXJ0c1swXSYmMD09PWMucGFydHNbMV0mJjA9PT1jLnBhcnRzWzJdJiYwPT09Yy5wYXJ0c1szXSlhPSEwO2Vsc2UgZm9yKG89MztvPj0wO28tLSl7bGV0IGU9MDtjb25zdCB0PVllKGMpO2lmKGM9dC5xdW90aWVudCxlPXQucmVtLmxvdyxlKWZvcihpPTg7aT49MDtpLS0pbls5Km8raV09ZSUxMCxlPU1hdGguZmxvb3IoZS8xMCl9aWYoYSl0PTEsbltzXT0wO2Vsc2UgZm9yKHQ9MzY7IW5bc107KXQtPTEscys9MTtjb25zdCB3PXQtMStkO2lmKHc+PTM0fHx3PD0tN3x8ZD4wKXtpZih0PjM0KXJldHVybiBsLnB1c2goIjAiKSxkPjA/bC5wdXNoKGBFKyR7ZH1gKTpkPDAmJmwucHVzaChgRSR7ZH1gKSxsLmpvaW4oIiIpO2wucHVzaChgJHtuW3MrK119YCksdC09MSx0JiZsLnB1c2goIi4iKTtmb3IobGV0IGU9MDtlPHQ7ZSsrKWwucHVzaChgJHtuW3MrK119YCk7bC5wdXNoKCJFIiksdz4wP2wucHVzaChgKyR7d31gKTpsLnB1c2goYCR7d31gKX1lbHNlIGlmKGQ+PTApZm9yKGxldCBlPTA7ZTx0O2UrKylsLnB1c2goYCR7bltzKytdfWApO2Vsc2V7bGV0IGU9dCtkO2lmKGU+MClmb3IobGV0IHQ9MDt0PGU7dCsrKWwucHVzaChgJHtuW3MrK119YCk7ZWxzZSBsLnB1c2goIjAiKTtmb3IobC5wdXNoKCIuIik7ZSsrPDA7KWwucHVzaCgiMCIpO2ZvcihsZXQgcj0wO3I8dC1NYXRoLm1heChlLTEsMCk7cisrKWwucHVzaChgJHtuW3MrK119YCl9cmV0dXJuIGwuam9pbigiIil9dG9KU09OKCl7cmV0dXJueyRudW1iZXJEZWNpbWFsOnRoaXMudG9TdHJpbmcoKX19dG9FeHRlbmRlZEpTT04oKXtyZXR1cm57JG51bWJlckRlY2ltYWw6dGhpcy50b1N0cmluZygpfX1zdGF0aWMgZnJvbUV4dGVuZGVkSlNPTihlKXtyZXR1cm4gSGUuZnJvbVN0cmluZyhlLiRudW1iZXJEZWNpbWFsKX1pbnNwZWN0KGUsdCxuKXtuPz89dztyZXR1cm5gbmV3IERlY2ltYWwxMjgoJHtuKHRoaXMudG9TdHJpbmcoKSx0KX0pYH19Y2xhc3MgS2UgZXh0ZW5kcyBoZXtnZXQgX2Jzb250eXBlKCl7cmV0dXJuIkRvdWJsZSJ9dmFsdWU7Y29uc3RydWN0b3IoZSl7c3VwZXIoKSxlIGluc3RhbmNlb2YgTnVtYmVyJiYoZT1lLnZhbHVlT2YoKSksdGhpcy52YWx1ZT0rZX1zdGF0aWMgZnJvbVN0cmluZyhlKXtjb25zdCB0PU51bWJlcihlKTtpZigiTmFOIj09PWUpcmV0dXJuIG5ldyBLZShOYU4pO2lmKCJJbmZpbml0eSI9PT1lKXJldHVybiBuZXcgS2UoMS8wKTtpZigiLUluZmluaXR5Ij09PWUpcmV0dXJuIG5ldyBLZSgtMS8wKTtpZighTnVtYmVyLmlzRmluaXRlKHQpKXRocm93IG5ldyBaKGBJbnB1dDogJHtlfSBpcyBub3QgcmVwcmVzZW50YWJsZSBhcyBhIERvdWJsZWApO2lmKGUudHJpbSgpIT09ZSl0aHJvdyBuZXcgWihgSW5wdXQ6ICcke2V9JyBjb250YWlucyB3aGl0ZXNwYWNlYCk7aWYoIiI9PT1lKXRocm93IG5ldyBaKCJJbnB1dCBpcyBhbiBlbXB0eSBzdHJpbmciKTtpZigvW14tMC05LitlRV0vLnRlc3QoZSkpdGhyb3cgbmV3IFooYElucHV0OiAnJHtlfScgaXMgbm90IGluIGRlY2ltYWwgb3IgZXhwb25lbnRpYWwgbm90YXRpb25gKTtyZXR1cm4gbmV3IEtlKHQpfXZhbHVlT2YoKXtyZXR1cm4gdGhpcy52YWx1ZX10b0pTT04oKXtyZXR1cm4gdGhpcy52YWx1ZX10b1N0cmluZyhlKXtyZXR1cm4gdGhpcy52YWx1ZS50b1N0cmluZyhlKX10b0V4dGVuZGVkSlNPTihlKXtyZXR1cm4gZSYmKGUubGVnYWN5fHxlLnJlbGF4ZWQmJmlzRmluaXRlKHRoaXMudmFsdWUpKT90aGlzLnZhbHVlOk9iamVjdC5pcyhNYXRoLnNpZ24odGhpcy52YWx1ZSksLTApP3skbnVtYmVyRG91YmxlOiItMC4wIn06eyRudW1iZXJEb3VibGU6TnVtYmVyLmlzSW50ZWdlcih0aGlzLnZhbHVlKT90aGlzLnZhbHVlLnRvRml4ZWQoMSk6dGhpcy52YWx1ZS50b1N0cmluZygpfX1zdGF0aWMgZnJvbUV4dGVuZGVkSlNPTihlLHQpe2NvbnN0IG49cGFyc2VGbG9hdChlLiRudW1iZXJEb3VibGUpO3JldHVybiB0JiZ0LnJlbGF4ZWQ/bjpuZXcgS2Uobil9aW5zcGVjdChlLHQsbil7cmV0dXJuIG4/Pz13LGBuZXcgRG91YmxlKCR7bih0aGlzLnZhbHVlLHQpfSlgfX1jbGFzcyBaZSBleHRlbmRzIGhle2dldCBfYnNvbnR5cGUoKXtyZXR1cm4iSW50MzIifXZhbHVlO2NvbnN0cnVjdG9yKGUpe3N1cGVyKCksZSBpbnN0YW5jZW9mIE51bWJlciYmKGU9ZS52YWx1ZU9mKCkpLHRoaXMudmFsdWU9MHwrZX1zdGF0aWMgZnJvbVN0cmluZyhlKXtjb25zdCB0PU5lKGUpLG49TnVtYmVyKGUpO2lmKG08bil0aHJvdyBuZXcgWihgSW5wdXQ6ICcke2V9JyBpcyBsYXJnZXIgdGhhbiB0aGUgbWF4aW11bSB2YWx1ZSBmb3IgSW50MzJgKTtpZihTPm4pdGhyb3cgbmV3IFooYElucHV0OiAnJHtlfScgaXMgc21hbGxlciB0aGFuIHRoZSBtaW5pbXVtIHZhbHVlIGZvciBJbnQzMmApO2lmKCFOdW1iZXIuaXNTYWZlSW50ZWdlcihuKSl0aHJvdyBuZXcgWihgSW5wdXQ6ICcke2V9JyBpcyBub3QgYSBzYWZlIGludGVnZXJgKTtpZihuLnRvU3RyaW5nKCkhPT10KXRocm93IG5ldyBaKGBJbnB1dDogJyR7ZX0nIGlzIG5vdCBhIHZhbGlkIEludDMyIHN0cmluZ2ApO3JldHVybiBuZXcgWmUobil9dmFsdWVPZigpe3JldHVybiB0aGlzLnZhbHVlfXRvU3RyaW5nKGUpe3JldHVybiB0aGlzLnZhbHVlLnRvU3RyaW5nKGUpfXRvSlNPTigpe3JldHVybiB0aGlzLnZhbHVlfXRvRXh0ZW5kZWRKU09OKGUpe3JldHVybiBlJiYoZS5yZWxheGVkfHxlLmxlZ2FjeSk/dGhpcy52YWx1ZTp7JG51bWJlckludDp0aGlzLnZhbHVlLnRvU3RyaW5nKCl9fXN0YXRpYyBmcm9tRXh0ZW5kZWRKU09OKGUsdCl7cmV0dXJuIHQmJnQucmVsYXhlZD9wYXJzZUludChlLiRudW1iZXJJbnQsMTApOm5ldyBaZShlLiRudW1iZXJJbnQpfWluc3BlY3QoZSx0LG4pe3JldHVybiBuPz89dyxgbmV3IEludDMyKCR7bih0aGlzLnZhbHVlLHQpfSlgfX1jbGFzcyBHZSBleHRlbmRzIGhle2dldCBfYnNvbnR5cGUoKXtyZXR1cm4iTWF4S2V5In10b0V4dGVuZGVkSlNPTigpe3JldHVybnskbWF4S2V5OjF9fXN0YXRpYyBmcm9tRXh0ZW5kZWRKU09OKCl7cmV0dXJuIG5ldyBHZX1pbnNwZWN0KCl7cmV0dXJuIm5ldyBNYXhLZXkoKSJ9fWNsYXNzIFhlIGV4dGVuZHMgaGV7Z2V0IF9ic29udHlwZSgpe3JldHVybiJNaW5LZXkifXRvRXh0ZW5kZWRKU09OKCl7cmV0dXJueyRtaW5LZXk6MX19c3RhdGljIGZyb21FeHRlbmRlZEpTT04oKXtyZXR1cm4gbmV3IFhlfWluc3BlY3QoKXtyZXR1cm4ibmV3IE1pbktleSgpIn19bGV0IFFlPW51bGw7Y29uc3QgZXQ9bmV3IFdlYWtNYXA7Y2xhc3MgdHQgZXh0ZW5kcyBoZXtnZXQgX2Jzb250eXBlKCl7cmV0dXJuIk9iamVjdElkIn1zdGF0aWMgaW5kZXg9TWF0aC5mbG9vcigxNjc3NzIxNSpNYXRoLnJhbmRvbSgpKTtzdGF0aWMgY2FjaGVIZXhTdHJpbmc7YnVmZmVyO2NvbnN0cnVjdG9yKGUpe2xldCB0O2lmKHN1cGVyKCksIm9iamVjdCI9PXR5cGVvZiBlJiZlJiYiaWQiaW4gZSl7aWYoInN0cmluZyIhPXR5cGVvZiBlLmlkJiYhQXJyYXlCdWZmZXIuaXNWaWV3KGUuaWQpKXRocm93IG5ldyBaKCJBcmd1bWVudCBwYXNzZWQgaW4gbXVzdCBoYXZlIGFuIGlkIHRoYXQgaXMgb2YgdHlwZSBzdHJpbmcgb3IgQnVmZmVyIik7dD0idG9IZXhTdHJpbmciaW4gZSYmImZ1bmN0aW9uIj09dHlwZW9mIGUudG9IZXhTdHJpbmc/X2UuZnJvbUhleChlLnRvSGV4U3RyaW5nKCkpOmUuaWR9ZWxzZSB0PWU7aWYobnVsbD09dCl0aGlzLmJ1ZmZlcj10dC5nZW5lcmF0ZSgpO2Vsc2UgaWYoQXJyYXlCdWZmZXIuaXNWaWV3KHQpJiYxMj09PXQuYnl0ZUxlbmd0aCl0aGlzLmJ1ZmZlcj1fZS50b0xvY2FsQnVmZmVyVHlwZSh0KTtlbHNle2lmKCJzdHJpbmciIT10eXBlb2YgdCl0aHJvdyBuZXcgWigiQXJndW1lbnQgcGFzc2VkIGluIGRvZXMgbm90IG1hdGNoIHRoZSBhY2NlcHRlZCB0eXBlcyIpO2lmKCF0dC52YWxpZGF0ZUhleFN0cmluZyh0KSl0aHJvdyBuZXcgWigiaW5wdXQgbXVzdCBiZSBhIDI0IGNoYXJhY3RlciBoZXggc3RyaW5nLCAxMiBieXRlIFVpbnQ4QXJyYXksIG9yIGFuIGludGVnZXIiKTt0aGlzLmJ1ZmZlcj1fZS5mcm9tSGV4KHQpLHR0LmNhY2hlSGV4U3RyaW5nJiZldC5zZXQodGhpcyx0KX19Z2V0IGlkKCl7cmV0dXJuIHRoaXMuYnVmZmVyfXNldCBpZChlKXt0aGlzLmJ1ZmZlcj1lLHR0LmNhY2hlSGV4U3RyaW5nJiZldC5zZXQodGhpcyxfZS50b0hleChlKSl9c3RhdGljIHZhbGlkYXRlSGV4U3RyaW5nKGUpe2lmKDI0IT09ZT8ubGVuZ3RoKXJldHVybiExO2ZvcihsZXQgdD0wO3Q8MjQ7dCsrKXtjb25zdCBuPWUuY2hhckNvZGVBdCh0KTtpZighKG4+PTQ4JiZuPD01N3x8bj49OTcmJm48PTEwMnx8bj49NjUmJm48PTcwKSlyZXR1cm4hMX1yZXR1cm4hMH10b0hleFN0cmluZygpe2lmKHR0LmNhY2hlSGV4U3RyaW5nKXtjb25zdCBlPWV0LmdldCh0aGlzKTtpZihlKXJldHVybiBlfWNvbnN0IGU9X2UudG9IZXgodGhpcy5pZCk7cmV0dXJuIHR0LmNhY2hlSGV4U3RyaW5nJiZldC5zZXQodGhpcyxlKSxlfXN0YXRpYyBnZXRJbmMoKXtyZXR1cm4gdHQuaW5kZXg9KHR0LmluZGV4KzEpJTE2Nzc3MjE1fXN0YXRpYyBnZW5lcmF0ZShlKXsibnVtYmVyIiE9dHlwZW9mIGUmJihlPU1hdGguZmxvb3IoRGF0ZS5ub3coKS8xZTMpKTtjb25zdCB0PXR0LmdldEluYygpLG49X2UuYWxsb2NhdGVVbnNhZmUoMTIpO3JldHVybiBwZS5zZXRJbnQzMkJFKG4sMCxlKSxudWxsPT09UWUmJihRZT1fZS5yYW5kb21CeXRlcyg1KSksbls0XT1RZVswXSxuWzVdPVFlWzFdLG5bNl09UWVbMl0sbls3XT1RZVszXSxuWzhdPVFlWzRdLG5bMTFdPTI1NSZ0LG5bMTBdPXQ+PjgmMjU1LG5bOV09dD4+MTYmMjU1LG59dG9TdHJpbmcoZSl7cmV0dXJuImJhc2U2NCI9PT1lP19lLnRvQmFzZTY0KHRoaXMuaWQpOnRoaXMudG9IZXhTdHJpbmcoKX10b0pTT04oKXtyZXR1cm4gdGhpcy50b0hleFN0cmluZygpfXN0YXRpYyBpcyhlKXtyZXR1cm4gbnVsbCE9ZSYmIm9iamVjdCI9PXR5cGVvZiBlJiYiX2Jzb250eXBlImluIGUmJiJPYmplY3RJZCI9PT1lLl9ic29udHlwZX1lcXVhbHMoZSl7aWYobnVsbD09ZSlyZXR1cm4hMTtpZih0dC5pcyhlKSlyZXR1cm4gdGhpcy5idWZmZXJbMTFdPT09ZS5idWZmZXJbMTFdJiZfZS5lcXVhbHModGhpcy5idWZmZXIsZS5idWZmZXIpO2lmKCJzdHJpbmciPT10eXBlb2YgZSlyZXR1cm4gZS50b0xvd2VyQ2FzZSgpPT09dGhpcy50b0hleFN0cmluZygpO2lmKCJvYmplY3QiPT10eXBlb2YgZSYmImZ1bmN0aW9uIj09dHlwZW9mIGUudG9IZXhTdHJpbmcpe2NvbnN0IHQ9ZS50b0hleFN0cmluZygpLG49dGhpcy50b0hleFN0cmluZygpO3JldHVybiJzdHJpbmciPT10eXBlb2YgdCYmdC50b0xvd2VyQ2FzZSgpPT09bn1yZXR1cm4hMX1nZXRUaW1lc3RhbXAoKXtjb25zdCBlPW5ldyBEYXRlLHQ9cGUuZ2V0VWludDMyQkUodGhpcy5idWZmZXIsMCk7cmV0dXJuIGUuc2V0VGltZSgxZTMqTWF0aC5mbG9vcih0KSksZX1zdGF0aWMgY3JlYXRlUGsoKXtyZXR1cm4gbmV3IHR0fXNlcmlhbGl6ZUludG8oZSx0KXtyZXR1cm4gZVt0XT10aGlzLmJ1ZmZlclswXSxlW3QrMV09dGhpcy5idWZmZXJbMV0sZVt0KzJdPXRoaXMuYnVmZmVyWzJdLGVbdCszXT10aGlzLmJ1ZmZlclszXSxlW3QrNF09dGhpcy5idWZmZXJbNF0sZVt0KzVdPXRoaXMuYnVmZmVyWzVdLGVbdCs2XT10aGlzLmJ1ZmZlcls2XSxlW3QrN109dGhpcy5idWZmZXJbN10sZVt0KzhdPXRoaXMuYnVmZmVyWzhdLGVbdCs5XT10aGlzLmJ1ZmZlcls5XSxlW3QrMTBdPXRoaXMuYnVmZmVyWzEwXSxlW3QrMTFdPXRoaXMuYnVmZmVyWzExXSwxMn1zdGF0aWMgY3JlYXRlRnJvbVRpbWUoZSl7Y29uc3QgdD1fZS5hbGxvY2F0ZSgxMik7Zm9yKGxldCBlPTExO2U+PTQ7ZS0tKXRbZV09MDtyZXR1cm4gcGUuc2V0SW50MzJCRSh0LDAsZSksbmV3IHR0KHQpfXN0YXRpYyBjcmVhdGVGcm9tSGV4U3RyaW5nKGUpe2lmKDI0IT09ZT8ubGVuZ3RoKXRocm93IG5ldyBaKCJoZXggc3RyaW5nIG11c3QgYmUgMjQgY2hhcmFjdGVycyIpO3JldHVybiBuZXcgdHQoX2UuZnJvbUhleChlKSl9c3RhdGljIGNyZWF0ZUZyb21CYXNlNjQoZSl7aWYoMTYhPT1lPy5sZW5ndGgpdGhyb3cgbmV3IFooImJhc2U2NCBzdHJpbmcgbXVzdCBiZSAxNiBjaGFyYWN0ZXJzIik7cmV0dXJuIG5ldyB0dChfZS5mcm9tQmFzZTY0KGUpKX1zdGF0aWMgaXNWYWxpZChlKXtpZihudWxsPT1lKXJldHVybiExO2lmKCJzdHJpbmciPT10eXBlb2YgZSlyZXR1cm4gdHQudmFsaWRhdGVIZXhTdHJpbmcoZSk7dHJ5e3JldHVybiBuZXcgdHQoZSksITB9Y2F0Y2h7cmV0dXJuITF9fXRvRXh0ZW5kZWRKU09OKCl7cmV0dXJuIHRoaXMudG9IZXhTdHJpbmc/eyRvaWQ6dGhpcy50b0hleFN0cmluZygpfTp7JG9pZDp0aGlzLnRvU3RyaW5nKCJoZXgiKX19c3RhdGljIGZyb21FeHRlbmRlZEpTT04oZSl7cmV0dXJuIG5ldyB0dChlLiRvaWQpfWlzQ2FjaGVkKCl7cmV0dXJuIHR0LmNhY2hlSGV4U3RyaW5nJiZldC5oYXModGhpcyl9aW5zcGVjdChlLHQsbil7cmV0dXJuIG4/Pz13LGBuZXcgT2JqZWN0SWQoJHtuKHRoaXMudG9IZXhTdHJpbmcoKSx0KX0pYH19ZnVuY3Rpb24gbnQoZSx0LG4pe2xldCByPTU7aWYoQXJyYXkuaXNBcnJheShlKSlmb3IobGV0IGk9MDtpPGUubGVuZ3RoO2krKylyKz1ydChpLnRvU3RyaW5nKCksZVtpXSx0LCEwLG4pO2Vsc2V7ImZ1bmN0aW9uIj09dHlwZW9mIGU/LnRvQlNPTiYmKGU9ZS50b0JTT04oKSk7Zm9yKGNvbnN0IGkgb2YgT2JqZWN0LmtleXMoZSkpcis9cnQoaSxlW2ldLHQsITEsbil9cmV0dXJuIHJ9ZnVuY3Rpb24gcnQoZSx0LG49ITEscj0hMSxpPSExKXtzd2l0Y2goImZ1bmN0aW9uIj09dHlwZW9mIHQ/LnRvQlNPTiYmKHQ9dC50b0JTT04oKSksdHlwZW9mIHQpe2Nhc2Uic3RyaW5nIjpyZXR1cm4gMStfZS51dGY4Qnl0ZUxlbmd0aChlKSsxKzQrX2UudXRmOEJ5dGVMZW5ndGgodCkrMTtjYXNlIm51bWJlciI6cmV0dXJuIE1hdGguZmxvb3IodCk9PT10JiZ0Pj1VJiZ0PD1FJiZ0Pj1TJiZ0PD1tPyhudWxsIT1lP19lLnV0ZjhCeXRlTGVuZ3RoKGUpKzE6MCkrNToobnVsbCE9ZT9fZS51dGY4Qnl0ZUxlbmd0aChlKSsxOjApKzk7Y2FzZSJ1bmRlZmluZWQiOnJldHVybiByfHwhaT8obnVsbCE9ZT9fZS51dGY4Qnl0ZUxlbmd0aChlKSsxOjApKzE6MDtjYXNlImJvb2xlYW4iOnJldHVybihudWxsIT1lP19lLnV0ZjhCeXRlTGVuZ3RoKGUpKzE6MCkrMjtjYXNlIm9iamVjdCI6aWYobnVsbCE9dCYmInN0cmluZyI9PXR5cGVvZiB0Ll9ic29udHlwZSYmdFt5XSE9PXApdGhyb3cgbmV3IEc7aWYobnVsbD09dHx8Ik1pbktleSI9PT10Ll9ic29udHlwZXx8Ik1heEtleSI9PT10Ll9ic29udHlwZSlyZXR1cm4obnVsbCE9ZT9fZS51dGY4Qnl0ZUxlbmd0aChlKSsxOjApKzE7aWYoIk9iamVjdElkIj09PXQuX2Jzb250eXBlKXJldHVybihudWxsIT1lP19lLnV0ZjhCeXRlTGVuZ3RoKGUpKzE6MCkrMTM7aWYodCBpbnN0YW5jZW9mIERhdGV8fGQodCkpcmV0dXJuKG51bGwhPWU/X2UudXRmOEJ5dGVMZW5ndGgoZSkrMTowKSs5O2lmKEFycmF5QnVmZmVyLmlzVmlldyh0KXx8dCBpbnN0YW5jZW9mIEFycmF5QnVmZmVyfHxnKHQpKXJldHVybihudWxsIT1lP19lLnV0ZjhCeXRlTGVuZ3RoKGUpKzE6MCkrNit0LmJ5dGVMZW5ndGg7aWYoIkxvbmciPT09dC5fYnNvbnR5cGV8fCJEb3VibGUiPT09dC5fYnNvbnR5cGV8fCJUaW1lc3RhbXAiPT09dC5fYnNvbnR5cGUpcmV0dXJuKG51bGwhPWU/X2UudXRmOEJ5dGVMZW5ndGgoZSkrMTowKSs5O2lmKCJEZWNpbWFsMTI4Ij09PXQuX2Jzb250eXBlKXJldHVybihudWxsIT1lP19lLnV0ZjhCeXRlTGVuZ3RoKGUpKzE6MCkrMTc7aWYoIkNvZGUiPT09dC5fYnNvbnR5cGUpcmV0dXJuIG51bGwhPXQuc2NvcGUmJk9iamVjdC5rZXlzKHQuc2NvcGUpLmxlbmd0aD4wPyhudWxsIT1lP19lLnV0ZjhCeXRlTGVuZ3RoKGUpKzE6MCkrMSs0KzQrX2UudXRmOEJ5dGVMZW5ndGgodC5jb2RlLnRvU3RyaW5nKCkpKzErbnQodC5zY29wZSxuLGkpOihudWxsIT1lP19lLnV0ZjhCeXRlTGVuZ3RoKGUpKzE6MCkrMSs0K19lLnV0ZjhCeXRlTGVuZ3RoKHQuY29kZS50b1N0cmluZygpKSsxO2lmKCJCaW5hcnkiPT09dC5fYnNvbnR5cGUpe2NvbnN0IG49dDtyZXR1cm4gbi5zdWJfdHlwZT09PXllLlNVQlRZUEVfQllURV9BUlJBWT8obnVsbCE9ZT9fZS51dGY4Qnl0ZUxlbmd0aChlKSsxOjApKyhuLnBvc2l0aW9uKzErNCsxKzQpOihudWxsIT1lP19lLnV0ZjhCeXRlTGVuZ3RoKGUpKzE6MCkrKG4ucG9zaXRpb24rMSs0KzEpfWlmKCJTeW1ib2wiPT09dC5fYnNvbnR5cGUpcmV0dXJuKG51bGwhPWU/X2UudXRmOEJ5dGVMZW5ndGgoZSkrMTowKStfZS51dGY4Qnl0ZUxlbmd0aCh0LnZhbHVlKSs0KzErMTtpZigiREJSZWYiPT09dC5fYnNvbnR5cGUpe2NvbnN0IHI9T2JqZWN0LmFzc2lnbih7JHJlZjp0LmNvbGxlY3Rpb24sJGlkOnQub2lkfSx0LmZpZWxkcyk7cmV0dXJuIG51bGwhPXQuZGImJihyLiRkYj10LmRiKSwobnVsbCE9ZT9fZS51dGY4Qnl0ZUxlbmd0aChlKSsxOjApKzErbnQocixuLGkpfXJldHVybiB0IGluc3RhbmNlb2YgUmVnRXhwfHxoKHQpPyhudWxsIT1lP19lLnV0ZjhCeXRlTGVuZ3RoKGUpKzE6MCkrMStfZS51dGY4Qnl0ZUxlbmd0aCh0LnNvdXJjZSkrMSsodC5nbG9iYWw/MTowKSsodC5pZ25vcmVDYXNlPzE6MCkrKHQubXVsdGlsaW5lPzE6MCkrMToiQlNPTlJlZ0V4cCI9PT10Ll9ic29udHlwZT8obnVsbCE9ZT9fZS51dGY4Qnl0ZUxlbmd0aChlKSsxOjApKzErX2UudXRmOEJ5dGVMZW5ndGgodC5wYXR0ZXJuKSsxK19lLnV0ZjhCeXRlTGVuZ3RoKHQub3B0aW9ucykrMToobnVsbCE9ZT9fZS51dGY4Qnl0ZUxlbmd0aChlKSsxOjApK250KHQsbixpKSsxO2Nhc2UiZnVuY3Rpb24iOnJldHVybiBuPyhudWxsIT1lP19lLnV0ZjhCeXRlTGVuZ3RoKGUpKzE6MCkrMSs0K19lLnV0ZjhCeXRlTGVuZ3RoKHQudG9TdHJpbmcoKSkrMTowO2Nhc2UiYmlnaW50IjpyZXR1cm4obnVsbCE9ZT9fZS51dGY4Qnl0ZUxlbmd0aChlKSsxOjApKzk7Y2FzZSJzeW1ib2wiOnJldHVybiAwO2RlZmF1bHQ6dGhyb3cgbmV3IFooIlVucmVjb2duaXplZCBKUyB0eXBlOiAiK3R5cGVvZiB0KX19Y2xhc3MgaXQgZXh0ZW5kcyBoZXtnZXQgX2Jzb250eXBlKCl7cmV0dXJuIkJTT05SZWdFeHAifXBhdHRlcm47b3B0aW9ucztjb25zdHJ1Y3RvcihlLHQpe2lmKHN1cGVyKCksdGhpcy5wYXR0ZXJuPWUsdGhpcy5vcHRpb25zPSh0Pz8iIikuc3BsaXQoIiIpLnNvcnQoKS5qb2luKCIiKSwtMSE9PXRoaXMucGF0dGVybi5pbmRleE9mKCJcMCIpKXRocm93IG5ldyBaKGBCU09OIFJlZ2V4IHBhdHRlcm5zIGNhbm5vdCBjb250YWluIG51bGwgYnl0ZXMsIGZvdW5kOiAke0pTT04uc3RyaW5naWZ5KHRoaXMucGF0dGVybil9YCk7aWYoLTEhPT10aGlzLm9wdGlvbnMuaW5kZXhPZigiXDAiKSl0aHJvdyBuZXcgWihgQlNPTiBSZWdleCBvcHRpb25zIGNhbm5vdCBjb250YWluIG51bGwgYnl0ZXMsIGZvdW5kOiAke0pTT04uc3RyaW5naWZ5KHRoaXMub3B0aW9ucyl9YCk7Zm9yKGxldCBlPTA7ZTx0aGlzLm9wdGlvbnMubGVuZ3RoO2UrKylpZigiaSIhPT10aGlzLm9wdGlvbnNbZV0mJiJtIiE9PXRoaXMub3B0aW9uc1tlXSYmIngiIT09dGhpcy5vcHRpb25zW2VdJiYibCIhPT10aGlzLm9wdGlvbnNbZV0mJiJzIiE9PXRoaXMub3B0aW9uc1tlXSYmInUiIT09dGhpcy5vcHRpb25zW2VdKXRocm93IG5ldyBaKGBUaGUgcmVndWxhciBleHByZXNzaW9uIG9wdGlvbiBbJHt0aGlzLm9wdGlvbnNbZV19XSBpcyBub3Qgc3VwcG9ydGVkYCl9c3RhdGljIHBhcnNlT3B0aW9ucyhlKXtyZXR1cm4gZT9lLnNwbGl0KCIiKS5zb3J0KCkuam9pbigiIik6IiJ9dG9FeHRlbmRlZEpTT04oZSl7cmV0dXJuKGU9ZXx8e30pLmxlZ2FjeT97JHJlZ2V4OnRoaXMucGF0dGVybiwkb3B0aW9uczp0aGlzLm9wdGlvbnN9OnskcmVndWxhckV4cHJlc3Npb246e3BhdHRlcm46dGhpcy5wYXR0ZXJuLG9wdGlvbnM6dGhpcy5vcHRpb25zfX19c3RhdGljIGZyb21FeHRlbmRlZEpTT04oZSl7aWYoIiRyZWdleCJpbiBlKXtpZigic3RyaW5nIj09dHlwZW9mIGUuJHJlZ2V4KXJldHVybiBuZXcgaXQoZS4kcmVnZXgsaXQucGFyc2VPcHRpb25zKGUuJG9wdGlvbnMpKTtpZigiQlNPTlJlZ0V4cCI9PT1lLiRyZWdleC5fYnNvbnR5cGUpcmV0dXJuIGV9aWYoIiRyZWd1bGFyRXhwcmVzc2lvbiJpbiBlKXJldHVybiBuZXcgaXQoZS4kcmVndWxhckV4cHJlc3Npb24ucGF0dGVybixpdC5wYXJzZU9wdGlvbnMoZS4kcmVndWxhckV4cHJlc3Npb24ub3B0aW9ucykpO3Rocm93IG5ldyBaKGBVbmV4cGVjdGVkIEJTT05SZWdFeHAgRUpTT04gb2JqZWN0IGZvcm06ICR7SlNPTi5zdHJpbmdpZnkoZSl9YCl9aW5zcGVjdChlLHQsbil7Y29uc3Qgcj1mdW5jdGlvbihlKXtpZihudWxsIT1lJiYib2JqZWN0Ij09dHlwZW9mIGUmJiJzdHlsaXplImluIGUmJiJmdW5jdGlvbiI9PXR5cGVvZiBlLnN0eWxpemUpcmV0dXJuIGUuc3R5bGl6ZX0odCk/PyhlPT5lKTtuPz89dztyZXR1cm5gbmV3IEJTT05SZWdFeHAoJHtyKG4odGhpcy5wYXR0ZXJuKSwicmVnZXhwIil9LCAke3Iobih0aGlzLm9wdGlvbnMpLCJyZWdleHAiKX0pYH19Y2xhc3Mgb3QgZXh0ZW5kcyBoZXtnZXQgX2Jzb250eXBlKCl7cmV0dXJuIkJTT05TeW1ib2wifXZhbHVlO2NvbnN0cnVjdG9yKGUpe3N1cGVyKCksdGhpcy52YWx1ZT1lfXZhbHVlT2YoKXtyZXR1cm4gdGhpcy52YWx1ZX10b1N0cmluZygpe3JldHVybiB0aGlzLnZhbHVlfXRvSlNPTigpe3JldHVybiB0aGlzLnZhbHVlfXRvRXh0ZW5kZWRKU09OKCl7cmV0dXJueyRzeW1ib2w6dGhpcy52YWx1ZX19c3RhdGljIGZyb21FeHRlbmRlZEpTT04oZSl7cmV0dXJuIG5ldyBvdChlLiRzeW1ib2wpfWluc3BlY3QoZSx0LG4pe3JldHVybiBuPz89dyxgbmV3IEJTT05TeW1ib2woJHtuKHRoaXMudmFsdWUsdCl9KWB9fWNvbnN0IHN0PWplO2NsYXNzIGF0IGV4dGVuZHMgc3R7Z2V0IF9ic29udHlwZSgpe3JldHVybiJUaW1lc3RhbXAifWdldFtnZV0oKXtyZXR1cm4iVGltZXN0YW1wIn1zdGF0aWMgTUFYX1ZBTFVFPWplLk1BWF9VTlNJR05FRF9WQUxVRTtnZXQgaSgpe3JldHVybiB0aGlzLmxvdz4+PjB9Z2V0IHQoKXtyZXR1cm4gdGhpcy5oaWdoPj4+MH1jb25zdHJ1Y3RvcihlKXtpZihudWxsPT1lKXN1cGVyKDAsMCwhMCk7ZWxzZSBpZigiYmlnaW50Ij09dHlwZW9mIGUpc3VwZXIoZSwhMCk7ZWxzZSBpZihqZS5pc0xvbmcoZSkpc3VwZXIoZS5sb3csZS5oaWdoLCEwKTtlbHNle2lmKCJvYmplY3QiIT10eXBlb2YgZXx8ISgidCJpbiBlKXx8ISgiaSJpbiBlKSl0aHJvdyBuZXcgWigiQSBUaW1lc3RhbXAgY2FuIG9ubHkgYmUgY29uc3RydWN0ZWQgd2l0aDogYmlnaW50LCBMb25nLCBvciB7IHQ6IG51bWJlcjsgaTogbnVtYmVyIH0iKTt7aWYoIm51bWJlciIhPXR5cGVvZiBlLnQmJigib2JqZWN0IiE9dHlwZW9mIGUudHx8IkludDMyIiE9PWUudC5fYnNvbnR5cGUpKXRocm93IG5ldyBaKCJUaW1lc3RhbXAgY29uc3RydWN0ZWQgZnJvbSB7IHQsIGkgfSBtdXN0IHByb3ZpZGUgdCBhcyBhIG51bWJlciIpO2lmKCJudW1iZXIiIT10eXBlb2YgZS5pJiYoIm9iamVjdCIhPXR5cGVvZiBlLml8fCJJbnQzMiIhPT1lLmkuX2Jzb250eXBlKSl0aHJvdyBuZXcgWigiVGltZXN0YW1wIGNvbnN0cnVjdGVkIGZyb20geyB0LCBpIH0gbXVzdCBwcm92aWRlIGkgYXMgYSBudW1iZXIiKTtjb25zdCB0PU51bWJlcihlLnQpLG49TnVtYmVyKGUuaSk7aWYodDwwfHxOdW1iZXIuaXNOYU4odCkpdGhyb3cgbmV3IFooIlRpbWVzdGFtcCBjb25zdHJ1Y3RlZCBmcm9tIHsgdCwgaSB9IG11c3QgcHJvdmlkZSBhIHBvc2l0aXZlIHQiKTtpZihuPDB8fE51bWJlci5pc05hTihuKSl0aHJvdyBuZXcgWigiVGltZXN0YW1wIGNvbnN0cnVjdGVkIGZyb20geyB0LCBpIH0gbXVzdCBwcm92aWRlIGEgcG9zaXRpdmUgaSIpO2lmKHQ+NDI5NDk2NzI5NSl0aHJvdyBuZXcgWigiVGltZXN0YW1wIGNvbnN0cnVjdGVkIGZyb20geyB0LCBpIH0gbXVzdCBwcm92aWRlIHQgZXF1YWwgb3IgbGVzcyB0aGFuIHVpbnQzMiBtYXgiKTtpZihuPjQyOTQ5NjcyOTUpdGhyb3cgbmV3IFooIlRpbWVzdGFtcCBjb25zdHJ1Y3RlZCBmcm9tIHsgdCwgaSB9IG11c3QgcHJvdmlkZSBpIGVxdWFsIG9yIGxlc3MgdGhhbiB1aW50MzIgbWF4Iik7c3VwZXIobix0LCEwKX19fXRvSlNPTigpe3JldHVybnskdGltZXN0YW1wOnRoaXMudG9TdHJpbmcoKX19c3RhdGljIGZyb21JbnQoZSl7cmV0dXJuIG5ldyBhdChqZS5mcm9tSW50KGUsITApKX1zdGF0aWMgZnJvbU51bWJlcihlKXtyZXR1cm4gbmV3IGF0KGplLmZyb21OdW1iZXIoZSwhMCkpfXN0YXRpYyBmcm9tQml0cyhlLHQpe3JldHVybiBuZXcgYXQoe2k6ZSx0OnR9KX1zdGF0aWMgZnJvbVN0cmluZyhlLHQpe3JldHVybiBuZXcgYXQoamUuZnJvbVN0cmluZyhlLCEwLHQpKX10b0V4dGVuZGVkSlNPTigpe3JldHVybnskdGltZXN0YW1wOnt0OnRoaXMudCxpOnRoaXMuaX19fXN0YXRpYyBmcm9tRXh0ZW5kZWRKU09OKGUpe2NvbnN0IHQ9amUuaXNMb25nKGUuJHRpbWVzdGFtcC5pKT9lLiR0aW1lc3RhbXAuaS5nZXRMb3dCaXRzVW5zaWduZWQoKTplLiR0aW1lc3RhbXAuaSxuPWplLmlzTG9uZyhlLiR0aW1lc3RhbXAudCk/ZS4kdGltZXN0YW1wLnQuZ2V0TG93Qml0c1Vuc2lnbmVkKCk6ZS4kdGltZXN0YW1wLnQ7cmV0dXJuIG5ldyBhdCh7dDpuLGk6dH0pfWluc3BlY3QoZSx0LG4pe24/Pz13O3JldHVybmBuZXcgVGltZXN0YW1wKHsgdDogJHtuKHRoaXMudCx0KX0sIGk6ICR7bih0aGlzLmksdCl9IH0pYH19Y29uc3QgY3Q9amUuZnJvbU51bWJlcihFKSxsdD1qZS5mcm9tTnVtYmVyKFUpO2Z1bmN0aW9uIGZ0KGUsdCxuKXtjb25zdCByPSh0PW51bGw9PXQ/e306dCkmJnQuaW5kZXg/dC5pbmRleDowLGk9cGUuZ2V0SW50MzJMRShlLHIpO2lmKGk8NSl0aHJvdyBuZXcgWihgYnNvbiBzaXplIG11c3QgYmUgPj0gNSwgaXMgJHtpfWApO2lmKHQuYWxsb3dPYmplY3RTbWFsbGVyVGhhbkJ1ZmZlclNpemUmJmUubGVuZ3RoPGkpdGhyb3cgbmV3IFooYGJ1ZmZlciBsZW5ndGggJHtlLmxlbmd0aH0gbXVzdCBiZSA+PSBic29uIHNpemUgJHtpfWApO2lmKCF0LmFsbG93T2JqZWN0U21hbGxlclRoYW5CdWZmZXJTaXplJiZlLmxlbmd0aCE9PWkpdGhyb3cgbmV3IFooYGJ1ZmZlciBsZW5ndGggJHtlLmxlbmd0aH0gbXVzdCA9PT0gYnNvbiBzaXplICR7aX1gKTtpZihpK3I+ZS5ieXRlTGVuZ3RoKXRocm93IG5ldyBaKGAoYnNvbiBzaXplICR7aX0gKyBvcHRpb25zLmluZGV4ICR7cn0gbXVzdCBiZSA8PSBidWZmZXIgbGVuZ3RoICR7ZS5ieXRlTGVuZ3RofSlgKTtpZigwIT09ZVtyK2ktMV0pdGhyb3cgbmV3IFooIk9uZSBvYmplY3QsIHNpemVkIGNvcnJlY3RseSwgd2l0aCBhIHNwb3QgZm9yIGFuIEVPTywgYnV0IHRoZSBFT08gaXNuJ3QgMHgwMCIpO3JldHVybiBfdChlLHIsdCxuKX1jb25zdCB1dD0vXlwkcmVmJHxeXCRpZCR8XlwkZGIkLztmdW5jdGlvbiBfdChlLHQsbixyPSExKXtjb25zdCBpPW51bGw9PW4uZmllbGRzQXNSYXc/bnVsbDpuLmZpZWxkc0FzUmF3LG89bnVsbCE9bi5yYXcmJm4ucmF3LHM9ImJvb2xlYW4iPT10eXBlb2Ygbi5ic29uUmVnRXhwJiZuLmJzb25SZWdFeHAsYT1uLnByb21vdGVCdWZmZXJzPz8hMSxjPW4ucHJvbW90ZUxvbmdzPz8hMCxsPW4ucHJvbW90ZVZhbHVlcz8/ITAsZj1uLnVzZUJpZ0ludDY0Pz8hMTtpZihmJiYhbCl0aHJvdyBuZXcgWigiTXVzdCBlaXRoZXIgcmVxdWVzdCBiaWdpbnQgb3IgTG9uZyBmb3IgaW50NjQgZGVzZXJpYWxpemF0aW9uIik7aWYoZiYmIWMpdGhyb3cgbmV3IFooIk11c3QgZWl0aGVyIHJlcXVlc3QgYmlnaW50IG9yIExvbmcgZm9yIGludDY0IGRlc2VyaWFsaXphdGlvbiIpO2xldCB1LF8sZz0hMDtjb25zdCBoPShudWxsPT1uLnZhbGlkYXRpb24/e3V0Zjg6ITB9Om4udmFsaWRhdGlvbikudXRmODtpZigiYm9vbGVhbiI9PXR5cGVvZiBoKXU9aDtlbHNle2c9ITE7Y29uc3QgZT1PYmplY3Qua2V5cyhoKS5tYXAoKGZ1bmN0aW9uKGUpe3JldHVybiBoW2VdfSkpO2lmKDA9PT1lLmxlbmd0aCl0aHJvdyBuZXcgWigiVVRGLTggdmFsaWRhdGlvbiBzZXR0aW5nIGNhbm5vdCBiZSBlbXB0eSIpO2lmKCJib29sZWFuIiE9dHlwZW9mIGVbMF0pdGhyb3cgbmV3IFooIkludmFsaWQgVVRGLTggdmFsaWRhdGlvbiBvcHRpb24sIG11c3Qgc3BlY2lmeSBib29sZWFuIHZhbHVlcyIpO2lmKHU9ZVswXSwhZS5ldmVyeSgoZT0+ZT09PXUpKSl0aHJvdyBuZXcgWigiSW52YWxpZCBVVEYtOCB2YWxpZGF0aW9uIG9wdGlvbiAtIGtleXMgbXVzdCBiZSBhbGwgdHJ1ZSBvciBhbGwgZmFsc2UiKX1pZighZyl7Xz1uZXcgU2V0O2Zvcihjb25zdCBlIG9mIE9iamVjdC5rZXlzKGgpKV8uYWRkKGUpfWNvbnN0IGI9dDtpZihlLmxlbmd0aDw1KXRocm93IG5ldyBaKCJjb3JydXB0IGJzb24gbWVzc2FnZSA8IDUgYnl0ZXMgbG9uZyIpO2NvbnN0IGQ9cGUuZ2V0SW50MzJMRShlLHQpO2lmKHQrPTQsZDw1fHxkPmUubGVuZ3RoKXRocm93IG5ldyBaKCJjb3JydXB0IGJzb24gbWVzc2FnZSIpO2NvbnN0IHc9cj9bXTp7fTtsZXQgcD0wLHk9IXImJm51bGw7Zm9yKDs7KXtjb25zdCBoPWVbdCsrXTtpZigwPT09aClicmVhaztsZXQgYj10O2Zvcig7MCE9PWVbYl0mJmI8ZS5sZW5ndGg7KWIrKztpZihiPj1lLmJ5dGVMZW5ndGgpdGhyb3cgbmV3IFooIkJhZCBCU09OIERvY3VtZW50OiBpbGxlZ2FsIENTdHJpbmciKTtjb25zdCBkPXI/cCsrOl9lLnRvVVRGOChlLHQsYiwhMSk7bGV0IG0sUz0hMDtpZihTPWd8fF8/LmhhcyhkKT91OiF1LCExIT09eSYmIiQiPT09ZFswXSYmKHk9dXQudGVzdChkKSksdD1iKzEsaD09PU4pe2NvbnN0IG49cGUuZ2V0SW50MzJMRShlLHQpO2lmKHQrPTQsbjw9MHx8bj5lLmxlbmd0aC10fHwwIT09ZVt0K24tMV0pdGhyb3cgbmV3IFooImJhZCBzdHJpbmcgbGVuZ3RoIGluIGJzb24iKTttPV9lLnRvVVRGOChlLHQsdCtuLTEsUyksdCs9bn1lbHNlIGlmKGg9PT1MKXtjb25zdCBuPV9lLmFsbG9jYXRlVW5zYWZlKDEyKTtmb3IobGV0IHI9MDtyPDEyO3IrKyluW3JdPWVbdCtyXTttPW5ldyB0dChuKSx0Kz0xMn1lbHNlIGlmKGg9PT1NJiYhMT09PWwpbT1uZXcgWmUocGUuZ2V0SW50MzJMRShlLHQpKSx0Kz00O2Vsc2UgaWYoaD09PU0pbT1wZS5nZXRJbnQzMkxFKGUsdCksdCs9NDtlbHNlIGlmKGg9PT1PKW09cGUuZ2V0RmxvYXQ2NExFKGUsdCksdCs9OCwhMT09PWwmJihtPW5ldyBLZShtKSk7ZWxzZSBpZihoPT09Uil7Y29uc3Qgbj1wZS5nZXRJbnQzMkxFKGUsdCkscj1wZS5nZXRJbnQzMkxFKGUsdCs0KTt0Kz04LG09bmV3IERhdGUobmV3IGplKG4scikudG9OdW1iZXIoKSl9ZWxzZSBpZihoPT09QSl7aWYoMCE9PWVbdF0mJjEhPT1lW3RdKXRocm93IG5ldyBaKCJpbGxlZ2FsIGJvb2xlYW4gdHlwZSB2YWx1ZSIpO209MT09PWVbdCsrXX1lbHNlIGlmKGg9PT1JKXtjb25zdCByPXQsaT1wZS5nZXRJbnQzMkxFKGUsdCk7aWYoaTw9MHx8aT5lLmxlbmd0aC10KXRocm93IG5ldyBaKCJiYWQgZW1iZWRkZWQgZG9jdW1lbnQgbGVuZ3RoIGluIGJzb24iKTtpZihvKW09ZS5zdWJhcnJheSh0LHQraSk7ZWxzZXtsZXQgdD1uO2d8fCh0PXsuLi5uLHZhbGlkYXRpb246e3V0Zjg6U319KSxtPV90KGUscix0LCExKX10Kz1pfWVsc2UgaWYoaD09PXYpe2NvbnN0IHI9dCxvPXBlLmdldEludDMyTEUoZSx0KTtsZXQgcz1uO2NvbnN0IGE9dCtvO2lmKGkmJmlbZF0mJihzPXsuLi5uLHJhdzohMH0pLGd8fChzPXsuLi5zLHZhbGlkYXRpb246e3V0Zjg6U319KSxtPV90KGUscixzLCEwKSwwIT09ZVsodCs9byktMV0pdGhyb3cgbmV3IFooImludmFsaWQgYXJyYXkgdGVybWluYXRvciBieXRlIik7aWYodCE9PWEpdGhyb3cgbmV3IFooImNvcnJ1cHRlZCBhcnJheSBic29uIil9ZWxzZSBpZihoPT09JCltPXZvaWQgMDtlbHNlIGlmKGg9PT1qKW09bnVsbDtlbHNlIGlmKGg9PT1QKWlmKGYpbT1wZS5nZXRCaWdJbnQ2NExFKGUsdCksdCs9ODtlbHNle2NvbnN0IG49cGUuZ2V0SW50MzJMRShlLHQpLHI9cGUuZ2V0SW50MzJMRShlLHQrNCk7dCs9ODtjb25zdCBpPW5ldyBqZShuLHIpO209YyYmITA9PT1sJiZpLmxlc3NUaGFuT3JFcXVhbChjdCkmJmkuZ3JlYXRlclRoYW5PckVxdWFsKGx0KT9pLnRvTnVtYmVyKCk6aX1lbHNlIGlmKGg9PT1KKXtjb25zdCBuPV9lLmFsbG9jYXRlVW5zYWZlKDE2KTtmb3IobGV0IHI9MDtyPDE2O3IrKyluW3JdPWVbdCtyXTt0Kz0xNixtPW5ldyBIZShuKX1lbHNlIGlmKGg9PT1UKXtsZXQgbj1wZS5nZXRJbnQzMkxFKGUsdCk7dCs9NDtjb25zdCByPW4saT1lW3QrK107aWYobjwwKXRocm93IG5ldyBaKCJOZWdhdGl2ZSBiaW5hcnkgdHlwZSBlbGVtZW50IHNpemUgZm91bmQiKTtpZihuPmUuYnl0ZUxlbmd0aCl0aHJvdyBuZXcgWigiQmluYXJ5IHR5cGUgc2l6ZSBsYXJnZXIgdGhhbiBkb2N1bWVudCBzaXplIik7aWYoaT09PXllLlNVQlRZUEVfQllURV9BUlJBWSl7aWYobj1wZS5nZXRJbnQzMkxFKGUsdCksdCs9NCxuPDApdGhyb3cgbmV3IFooIk5lZ2F0aXZlIGJpbmFyeSB0eXBlIGVsZW1lbnQgc2l6ZSBmb3VuZCBmb3Igc3VidHlwZSAweDAyIik7aWYobj5yLTQpdGhyb3cgbmV3IFooIkJpbmFyeSB0eXBlIHdpdGggc3VidHlwZSAweDAyIGNvbnRhaW5zIHRvbyBsb25nIGJpbmFyeSBzaXplIik7aWYobjxyLTQpdGhyb3cgbmV3IFooIkJpbmFyeSB0eXBlIHdpdGggc3VidHlwZSAweDAyIGNvbnRhaW5zIHRvbyBzaG9ydCBiaW5hcnkgc2l6ZSIpfWEmJmw/bT1fZS50b0xvY2FsQnVmZmVyVHlwZShlLnN1YmFycmF5KHQsdCtuKSk6KG09bmV3IHllKGUuc3ViYXJyYXkodCx0K24pLGkpLGk9PT1IJiZ4ZS5pc1ZhbGlkKG0pJiYobT1tLnRvVVVJRCgpKSksdCs9bn1lbHNlIGlmKGg9PT1GJiYhMT09PXMpe2ZvcihiPXQ7MCE9PWVbYl0mJmI8ZS5sZW5ndGg7KWIrKztpZihiPj1lLmxlbmd0aCl0aHJvdyBuZXcgWigiQmFkIEJTT04gRG9jdW1lbnQ6IGlsbGVnYWwgQ1N0cmluZyIpO2NvbnN0IG49X2UudG9VVEY4KGUsdCxiLCExKTtmb3IoYj10PWIrMTswIT09ZVtiXSYmYjxlLmxlbmd0aDspYisrO2lmKGI+PWUubGVuZ3RoKXRocm93IG5ldyBaKCJCYWQgQlNPTiBEb2N1bWVudDogaWxsZWdhbCBDU3RyaW5nIik7Y29uc3Qgcj1fZS50b1VURjgoZSx0LGIsITEpO3Q9YisxO2NvbnN0IGk9bmV3IEFycmF5KHIubGVuZ3RoKTtmb3IoYj0wO2I8ci5sZW5ndGg7YisrKXN3aXRjaChyW2JdKXtjYXNlIm0iOmlbYl09Im0iO2JyZWFrO2Nhc2UicyI6aVtiXT0iZyI7YnJlYWs7Y2FzZSJpIjppW2JdPSJpIn1tPW5ldyBSZWdFeHAobixpLmpvaW4oIiIpKX1lbHNlIGlmKGg9PT1GJiYhMD09PXMpe2ZvcihiPXQ7MCE9PWVbYl0mJmI8ZS5sZW5ndGg7KWIrKztpZihiPj1lLmxlbmd0aCl0aHJvdyBuZXcgWigiQmFkIEJTT04gRG9jdW1lbnQ6IGlsbGVnYWwgQ1N0cmluZyIpO2NvbnN0IG49X2UudG9VVEY4KGUsdCxiLCExKTtmb3IoYj10PWIrMTswIT09ZVtiXSYmYjxlLmxlbmd0aDspYisrO2lmKGI+PWUubGVuZ3RoKXRocm93IG5ldyBaKCJCYWQgQlNPTiBEb2N1bWVudDogaWxsZWdhbCBDU3RyaW5nIik7Y29uc3Qgcj1fZS50b1VURjgoZSx0LGIsITEpO3Q9YisxLG09bmV3IGl0KG4scil9ZWxzZSBpZihoPT09RCl7Y29uc3Qgbj1wZS5nZXRJbnQzMkxFKGUsdCk7aWYodCs9NCxuPD0wfHxuPmUubGVuZ3RoLXR8fDAhPT1lW3Qrbi0xXSl0aHJvdyBuZXcgWigiYmFkIHN0cmluZyBsZW5ndGggaW4gYnNvbiIpO2NvbnN0IHI9X2UudG9VVEY4KGUsdCx0K24tMSxTKTttPWw/cjpuZXcgb3QociksdCs9bn1lbHNlIGlmKGg9PT1WKW09bmV3IGF0KHtpOnBlLmdldFVpbnQzMkxFKGUsdCksdDpwZS5nZXRVaW50MzJMRShlLHQrNCl9KSx0Kz04O2Vsc2UgaWYoaD09PVcpbT1uZXcgWGU7ZWxzZSBpZihoPT09WSltPW5ldyBHZTtlbHNlIGlmKGg9PT16KXtjb25zdCBuPXBlLmdldEludDMyTEUoZSx0KTtpZih0Kz00LG48PTB8fG4+ZS5sZW5ndGgtdHx8MCE9PWVbdCtuLTFdKXRocm93IG5ldyBaKCJiYWQgc3RyaW5nIGxlbmd0aCBpbiBic29uIik7Y29uc3Qgcj1fZS50b1VURjgoZSx0LHQrbi0xLFMpO209bmV3IEVlKHIpLHQrPW59ZWxzZSBpZihoPT09Qyl7Y29uc3Qgcj1wZS5nZXRJbnQzMkxFKGUsdCk7aWYodCs9NCxyPDEzKXRocm93IG5ldyBaKCJjb2RlX3dfc2NvcGUgdG90YWwgc2l6ZSBzaG9ydGVyIG1pbmltdW0gZXhwZWN0ZWQgbGVuZ3RoIik7Y29uc3QgaT1wZS5nZXRJbnQzMkxFKGUsdCk7aWYodCs9NCxpPD0wfHxpPmUubGVuZ3RoLXR8fDAhPT1lW3QraS0xXSl0aHJvdyBuZXcgWigiYmFkIHN0cmluZyBsZW5ndGggaW4gYnNvbiIpO2NvbnN0IG89X2UudG9VVEY4KGUsdCx0K2ktMSxTKSxzPXQrPWksYT1wZS5nZXRJbnQzMkxFKGUsdCksYz1fdChlLHMsbiwhMSk7aWYodCs9YSxyPDgrYStpKXRocm93IG5ldyBaKCJjb2RlX3dfc2NvcGUgdG90YWwgc2l6ZSBpcyB0b28gc2hvcnQsIHRydW5jYXRpbmcgc2NvcGUiKTtpZihyPjgrYStpKXRocm93IG5ldyBaKCJjb2RlX3dfc2NvcGUgdG90YWwgc2l6ZSBpcyB0b28gbG9uZywgY2xpcHMgb3V0ZXIgZG9jdW1lbnQiKTttPW5ldyBFZShvLGMpfWVsc2V7aWYoaCE9PWspdGhyb3cgbmV3IFooYERldGVjdGVkIHVua25vd24gQlNPTiB0eXBlICR7aC50b1N0cmluZygxNil9IGZvciBmaWVsZG5hbWUgIiR7ZH0iYCk7e2NvbnN0IG49cGUuZ2V0SW50MzJMRShlLHQpO2lmKHQrPTQsbjw9MHx8bj5lLmxlbmd0aC10fHwwIT09ZVt0K24tMV0pdGhyb3cgbmV3IFooImJhZCBzdHJpbmcgbGVuZ3RoIGluIGJzb24iKTtjb25zdCByPV9lLnRvVVRGOChlLHQsdCtuLTEsUyk7dCs9bjtjb25zdCBpPV9lLmFsbG9jYXRlVW5zYWZlKDEyKTtmb3IobGV0IG49MDtuPDEyO24rKylpW25dPWVbdCtuXTtjb25zdCBvPW5ldyB0dChpKTt0Kz0xMixtPW5ldyBPZShyLG8pfX0iX19wcm90b19fIj09PWQ/T2JqZWN0LmRlZmluZVByb3BlcnR5KHcsZCx7dmFsdWU6bSx3cml0YWJsZTohMCxlbnVtZXJhYmxlOiEwLGNvbmZpZ3VyYWJsZTohMH0pOndbZF09bX1pZihkIT09dC1iKXtpZihyKXRocm93IG5ldyBaKCJjb3JydXB0IGFycmF5IGJzb24iKTt0aHJvdyBuZXcgWigiY29ycnVwdCBvYmplY3QgYnNvbiIpfWlmKCF5KXJldHVybiB3O2lmKFVlKHcpKXtjb25zdCBlPU9iamVjdC5hc3NpZ24oe30sdyk7cmV0dXJuIGRlbGV0ZSBlLiRyZWYsZGVsZXRlIGUuJGlkLGRlbGV0ZSBlLiRkYixuZXcgT2Uody4kcmVmLHcuJGlkLHcuJGRiLGUpfXJldHVybiB3fWNvbnN0IGd0PS9ceDAwLyxodD1uZXcgU2V0KFsiJGRiIiwiJHJlZiIsIiRpZCIsIiRjbHVzdGVyVGltZSJdKTtmdW5jdGlvbiBidChlLHQsbixyKXtlW3IrK109TjtlWyhyPXIrX2UuZW5jb2RlVVRGOEludG8oZSx0LHIpKzEpLTFdPTA7Y29uc3QgaT1fZS5lbmNvZGVVVEY4SW50byhlLG4scis0KTtyZXR1cm4gcGUuc2V0SW50MzJMRShlLHIsaSsxKSxyPXIrNCtpLGVbcisrXT0wLHJ9ZnVuY3Rpb24gZHQoZSx0LG4scil7Y29uc3QgaT0hT2JqZWN0LmlzKG4sLTApJiZOdW1iZXIuaXNTYWZlSW50ZWdlcihuKSYmbjw9bSYmbj49Uz9NOk87ZVtyKytdPWk7cmV0dXJuIHIrPV9lLmVuY29kZVVURjhJbnRvKGUsdCxyKSxlW3IrK109MCxyKz1pPT09TT9wZS5zZXRJbnQzMkxFKGUscixuKTpwZS5zZXRGbG9hdDY0TEUoZSxyLG4pfWZ1bmN0aW9uIHd0KGUsdCxuLHIpe2VbcisrXT1QO3JldHVybiByKz1fZS5lbmNvZGVVVEY4SW50byhlLHQsciksZVtyKytdPTAscis9cGUuc2V0QmlnSW50NjRMRShlLHIsbil9ZnVuY3Rpb24gcHQoZSx0LG4scil7ZVtyKytdPWo7cmV0dXJuIHIrPV9lLmVuY29kZVVURjhJbnRvKGUsdCxyKSxlW3IrK109MCxyfWZ1bmN0aW9uIHl0KGUsdCxuLHIpe2VbcisrXT1BO3JldHVybiByKz1fZS5lbmNvZGVVVEY4SW50byhlLHQsciksZVtyKytdPTAsZVtyKytdPW4/MTowLHJ9ZnVuY3Rpb24gbXQoZSx0LG4scil7ZVtyKytdPVI7cis9X2UuZW5jb2RlVVRGOEludG8oZSx0LHIpLGVbcisrXT0wO2NvbnN0IGk9amUuZnJvbU51bWJlcihuLmdldFRpbWUoKSksbz1pLmdldExvd0JpdHMoKSxzPWkuZ2V0SGlnaEJpdHMoKTtyZXR1cm4gcis9cGUuc2V0SW50MzJMRShlLHIsbykscis9cGUuc2V0SW50MzJMRShlLHIscyl9ZnVuY3Rpb24gU3QoZSx0LG4scil7ZVtyKytdPUY7aWYocis9X2UuZW5jb2RlVVRGOEludG8oZSx0LHIpLGVbcisrXT0wLG4uc291cmNlJiZudWxsIT1uLnNvdXJjZS5tYXRjaChndCkpdGhyb3cgbmV3IFooInZhbHVlICIrbi5zb3VyY2UrIiBtdXN0IG5vdCBjb250YWluIG51bGwgYnl0ZXMiKTtyZXR1cm4gcis9X2UuZW5jb2RlVVRGOEludG8oZSxuLnNvdXJjZSxyKSxlW3IrK109MCxuLmlnbm9yZUNhc2UmJihlW3IrK109MTA1KSxuLmdsb2JhbCYmKGVbcisrXT0xMTUpLG4ubXVsdGlsaW5lJiYoZVtyKytdPTEwOSksZVtyKytdPTAscn1mdW5jdGlvbiBCdChlLHQsbixyKXtlW3IrK109RjtpZihyKz1fZS5lbmNvZGVVVEY4SW50byhlLHQsciksZVtyKytdPTAsbnVsbCE9bi5wYXR0ZXJuLm1hdGNoKGd0KSl0aHJvdyBuZXcgWigicGF0dGVybiAiK24ucGF0dGVybisiIG11c3Qgbm90IGNvbnRhaW4gbnVsbCBieXRlcyIpO3IrPV9lLmVuY29kZVVURjhJbnRvKGUsbi5wYXR0ZXJuLHIpLGVbcisrXT0wO2NvbnN0IGk9bi5vcHRpb25zLnNwbGl0KCIiKS5zb3J0KCkuam9pbigiIik7cmV0dXJuIHIrPV9lLmVuY29kZVVURjhJbnRvKGUsaSxyKSxlW3IrK109MCxyfWZ1bmN0aW9uIHh0KGUsdCxuLHIpe251bGw9PT1uP2VbcisrXT1qOiJNaW5LZXkiPT09bi5fYnNvbnR5cGU/ZVtyKytdPVc6ZVtyKytdPVk7cmV0dXJuIHIrPV9lLmVuY29kZVVURjhJbnRvKGUsdCxyKSxlW3IrK109MCxyfWZ1bmN0aW9uIEV0KGUsdCxuLHIpe2VbcisrXT1MO3JldHVybiByKz1fZS5lbmNvZGVVVEY4SW50byhlLHQsciksZVtyKytdPTAscis9bi5zZXJpYWxpemVJbnRvKGUscil9ZnVuY3Rpb24gVXQoZSx0LG4scil7ZVtyKytdPVQ7cis9X2UuZW5jb2RlVVRGOEludG8oZSx0LHIpLGVbcisrXT0wO2NvbnN0IGk9bi5sZW5ndGg7aWYocis9cGUuc2V0SW50MzJMRShlLHIsaSksZVtyKytdPXEsaTw9MTYpZm9yKGxldCB0PTA7dDxpO3QrKyllW3IrdF09blt0XTtlbHNlIGUuc2V0KG4scik7cmV0dXJuIHIrPWl9ZnVuY3Rpb24gT3QoZSx0LG4scixpLG8scyxhLGMpe2lmKGMuaGFzKG4pKXRocm93IG5ldyBaKCJDYW5ub3QgY29udmVydCBjaXJjdWxhciBzdHJ1Y3R1cmUgdG8gQlNPTiIpO2MuYWRkKG4pLGVbcisrXT1BcnJheS5pc0FycmF5KG4pP3Y6STtyKz1fZS5lbmNvZGVVVEY4SW50byhlLHQsciksZVtyKytdPTA7Y29uc3QgbD1GdChlLG4saSxyLG8rMSxzLGEsYyk7cmV0dXJuIGMuZGVsZXRlKG4pLGx9ZnVuY3Rpb24gTnQoZSx0LG4scil7ZVtyKytdPUo7cis9X2UuZW5jb2RlVVRGOEludG8oZSx0LHIpLGVbcisrXT0wO2ZvcihsZXQgdD0wO3Q8MTY7dCsrKWVbcit0XT1uLmJ5dGVzW3RdO3JldHVybiByKzE2fWZ1bmN0aW9uIEl0KGUsdCxuLHIpe2VbcisrXT0iTG9uZyI9PT1uLl9ic29udHlwZT9QOlY7cis9X2UuZW5jb2RlVVRGOEludG8oZSx0LHIpLGVbcisrXT0wO2NvbnN0IGk9bi5nZXRMb3dCaXRzKCksbz1uLmdldEhpZ2hCaXRzKCk7cmV0dXJuIHIrPXBlLnNldEludDMyTEUoZSxyLGkpLHIrPXBlLnNldEludDMyTEUoZSxyLG8pfWZ1bmN0aW9uIHZ0KGUsdCxuLHIpe249bi52YWx1ZU9mKCksZVtyKytdPU07cmV0dXJuIHIrPV9lLmVuY29kZVVURjhJbnRvKGUsdCxyKSxlW3IrK109MCxyKz1wZS5zZXRJbnQzMkxFKGUscixuKX1mdW5jdGlvbiBUdChlLHQsbixyKXtlW3IrK109TztyZXR1cm4gcis9X2UuZW5jb2RlVVRGOEludG8oZSx0LHIpLGVbcisrXT0wLHIrPXBlLnNldEZsb2F0NjRMRShlLHIsbi52YWx1ZSl9ZnVuY3Rpb24gJHQoZSx0LG4scil7ZVtyKytdPXo7cis9X2UuZW5jb2RlVVRGOEludG8oZSx0LHIpLGVbcisrXT0wO2NvbnN0IGk9bi50b1N0cmluZygpLG89X2UuZW5jb2RlVVRGOEludG8oZSxpLHIrNCkrMTtyZXR1cm4gcGUuc2V0SW50MzJMRShlLHIsbykscj1yKzQrby0xLGVbcisrXT0wLHJ9ZnVuY3Rpb24gTHQoZSx0LG4scixpPSExLG89MCxzPSExLGE9ITAsYyl7aWYobi5zY29wZSYmIm9iamVjdCI9PXR5cGVvZiBuLnNjb3BlKXtlW3IrK109QztyKz1fZS5lbmNvZGVVVEY4SW50byhlLHQsciksZVtyKytdPTA7bGV0IGw9cjtjb25zdCBmPW4uY29kZTtyKz00O2NvbnN0IHU9X2UuZW5jb2RlVVRGOEludG8oZSxmLHIrNCkrMTtwZS5zZXRJbnQzMkxFKGUscix1KSxlW3IrNCt1LTFdPTAscj1yK3UrNDtjb25zdCBfPUZ0KGUsbi5zY29wZSxpLHIsbysxLHMsYSxjKTtyPV8tMTtjb25zdCBnPV8tbDtsKz1wZS5zZXRJbnQzMkxFKGUsbCxnKSxlW3IrK109MH1lbHNle2VbcisrXT16O3IrPV9lLmVuY29kZVVURjhJbnRvKGUsdCxyKSxlW3IrK109MDtjb25zdCBpPW4uY29kZS50b1N0cmluZygpLG89X2UuZW5jb2RlVVRGOEludG8oZSxpLHIrNCkrMTtwZS5zZXRJbnQzMkxFKGUscixvKSxyPXIrNCtvLTEsZVtyKytdPTB9cmV0dXJuIHJ9ZnVuY3Rpb24gQXQoZSx0LG4scil7ZVtyKytdPVQ7cis9X2UuZW5jb2RlVVRGOEludG8oZSx0LHIpLGVbcisrXT0wO2NvbnN0IGk9bi5idWZmZXI7bGV0IG89bi5wb3NpdGlvbjtpZihuLnN1Yl90eXBlPT09eWUuU1VCVFlQRV9CWVRFX0FSUkFZJiYobys9NCkscis9cGUuc2V0SW50MzJMRShlLHIsbyksZVtyKytdPW4uc3ViX3R5cGUsbi5zdWJfdHlwZT09PXllLlNVQlRZUEVfQllURV9BUlJBWSYmKG8tPTQscis9cGUuc2V0SW50MzJMRShlLHIsbykpLG4uc3ViX3R5cGU9PT15ZS5TVUJUWVBFX1ZFQ1RPUiYmbWUobiksbzw9MTYpZm9yKGxldCB0PTA7dDxvO3QrKyllW3IrdF09aVt0XTtlbHNlIGUuc2V0KGkscik7cmV0dXJuIHIrPW4ucG9zaXRpb259ZnVuY3Rpb24gUnQoZSx0LG4scil7ZVtyKytdPUQ7cis9X2UuZW5jb2RlVVRGOEludG8oZSx0LHIpLGVbcisrXT0wO2NvbnN0IGk9X2UuZW5jb2RlVVRGOEludG8oZSxuLnZhbHVlLHIrNCkrMTtyZXR1cm4gcGUuc2V0SW50MzJMRShlLHIsaSkscj1yKzQraS0xLGVbcisrXT0wLHJ9ZnVuY3Rpb24ganQoZSx0LG4scixpLG8scyl7ZVtyKytdPUk7cis9X2UuZW5jb2RlVVRGOEludG8oZSx0LHIpLGVbcisrXT0wO2xldCBhPXIsYz17JHJlZjpuLmNvbGxlY3Rpb258fG4ubmFtZXNwYWNlLCRpZDpuLm9pZH07bnVsbCE9bi5kYiYmKGMuJGRiPW4uZGIpLGM9T2JqZWN0LmFzc2lnbihjLG4uZmllbGRzKTtjb25zdCBsPUZ0KGUsYywhMSxyLGkrMSxvLCEwLHMpLGY9bC1hO3JldHVybiBhKz1wZS5zZXRJbnQzMkxFKGUscixmKSxsfWZ1bmN0aW9uIEZ0KGUsdCxuLHIsaSxvLHMsYSl7aWYobnVsbD09YSl7aWYobnVsbD09dClyZXR1cm4gZVswXT01LGVbMV09MCxlWzJdPTAsZVszXT0wLGVbNF09MCw1O2lmKEFycmF5LmlzQXJyYXkodCkpdGhyb3cgbmV3IFooInNlcmlhbGl6ZSBkb2VzIG5vdCBzdXBwb3J0IGFuIGFycmF5IGFzIHRoZSByb290IGlucHV0Iik7aWYoIm9iamVjdCIhPXR5cGVvZiB0KXRocm93IG5ldyBaKCJzZXJpYWxpemUgZG9lcyBub3Qgc3VwcG9ydCBub24tb2JqZWN0IGFzIHRoZSByb290IGlucHV0Iik7aWYoIl9ic29udHlwZSJpbiB0JiYic3RyaW5nIj09dHlwZW9mIHQuX2Jzb250eXBlKXRocm93IG5ldyBaKCJCU09OIHR5cGVzIGNhbm5vdCBiZSBzZXJpYWxpemVkIGFzIGEgZG9jdW1lbnQiKTtpZihkKHQpfHxoKHQpfHxfKHQpfHxnKHQpKXRocm93IG5ldyBaKCJkYXRlLCByZWdleHAsIHR5cGVkYXJyYXksIGFuZCBhcnJheWJ1ZmZlciBjYW5ub3QgYmUgQlNPTiBkb2N1bWVudHMiKTthPW5ldyBTZXR9YS5hZGQodCk7bGV0IGM9cis0O2lmKEFycmF5LmlzQXJyYXkodCkpZm9yKGxldCByPTA7cjx0Lmxlbmd0aDtyKyspe2NvbnN0IGw9YCR7cn1gO2xldCBmPXRbcl07ImZ1bmN0aW9uIj09dHlwZW9mIGY/LnRvQlNPTiYmKGY9Zi50b0JTT04oKSk7Y29uc3QgdT10eXBlb2YgZjtpZih2b2lkIDA9PT1mKWM9cHQoZSxsLDAsYyk7ZWxzZSBpZihudWxsPT09ZiljPXB0KGUsbCwwLGMpO2Vsc2UgaWYoInN0cmluZyI9PT11KWM9YnQoZSxsLGYsYyk7ZWxzZSBpZigibnVtYmVyIj09PXUpYz1kdChlLGwsZixjKTtlbHNlIGlmKCJiaWdpbnQiPT09dSljPXd0KGUsbCxmLGMpO2Vsc2UgaWYoImJvb2xlYW4iPT09dSljPXl0KGUsbCxmLGMpO2Vsc2UgaWYoIm9iamVjdCI9PT11JiZudWxsPT1mLl9ic29udHlwZSljPWYgaW5zdGFuY2VvZiBEYXRlfHxkKGYpP210KGUsbCxmLGMpOmYgaW5zdGFuY2VvZiBVaW50OEFycmF5fHxfKGYpP1V0KGUsbCxmLGMpOmYgaW5zdGFuY2VvZiBSZWdFeHB8fGgoZik/U3QoZSxsLGYsYyk6T3QoZSxsLGYsYyxuLGksbyxzLGEpO2Vsc2UgaWYoIm9iamVjdCI9PT11KXtpZihmW3ldIT09cCl0aHJvdyBuZXcgRztpZigiT2JqZWN0SWQiPT09Zi5fYnNvbnR5cGUpYz1FdChlLGwsZixjKTtlbHNlIGlmKCJEZWNpbWFsMTI4Ij09PWYuX2Jzb250eXBlKWM9TnQoZSxsLGYsYyk7ZWxzZSBpZigiTG9uZyI9PT1mLl9ic29udHlwZXx8IlRpbWVzdGFtcCI9PT1mLl9ic29udHlwZSljPUl0KGUsbCxmLGMpO2Vsc2UgaWYoIkRvdWJsZSI9PT1mLl9ic29udHlwZSljPVR0KGUsbCxmLGMpO2Vsc2UgaWYoIkNvZGUiPT09Zi5fYnNvbnR5cGUpYz1MdChlLGwsZixjLG4saSxvLHMsYSk7ZWxzZSBpZigiQmluYXJ5Ij09PWYuX2Jzb250eXBlKWM9QXQoZSxsLGYsYyk7ZWxzZSBpZigiQlNPTlN5bWJvbCI9PT1mLl9ic29udHlwZSljPVJ0KGUsbCxmLGMpO2Vsc2UgaWYoIkRCUmVmIj09PWYuX2Jzb250eXBlKWM9anQoZSxsLGYsYyxpLG8sYSk7ZWxzZSBpZigiQlNPTlJlZ0V4cCI9PT1mLl9ic29udHlwZSljPUJ0KGUsbCxmLGMpO2Vsc2UgaWYoIkludDMyIj09PWYuX2Jzb250eXBlKWM9dnQoZSxsLGYsYyk7ZWxzZSBpZigiTWluS2V5Ij09PWYuX2Jzb250eXBlfHwiTWF4S2V5Ij09PWYuX2Jzb250eXBlKWM9eHQoZSxsLGYsYyk7ZWxzZSBpZih2b2lkIDAhPT1mLl9ic29udHlwZSl0aHJvdyBuZXcgWihgVW5yZWNvZ25pemVkIG9yIGludmFsaWQgX2Jzb250eXBlOiAke1N0cmluZyhmLl9ic29udHlwZSl9YCl9ZWxzZSJmdW5jdGlvbiI9PT11JiZvJiYoYz0kdChlLGwsZixjKSl9ZWxzZSBpZih0IGluc3RhbmNlb2YgTWFwfHxiKHQpKXtjb25zdCByPXQuZW50cmllcygpO2xldCBsPSExO2Zvcig7IWw7KXtjb25zdCB0PXIubmV4dCgpO2lmKGw9ISF0LmRvbmUsbCljb250aW51ZTtjb25zdCBmPXQudmFsdWU/dC52YWx1ZVswXTp2b2lkIDA7bGV0IHU9dC52YWx1ZT90LnZhbHVlWzFdOnZvaWQgMDsiZnVuY3Rpb24iPT10eXBlb2YgdT8udG9CU09OJiYodT11LnRvQlNPTigpKTtjb25zdCBnPXR5cGVvZiB1O2lmKCJzdHJpbmciPT10eXBlb2YgZiYmIWh0LmhhcyhmKSl7aWYobnVsbCE9Zi5tYXRjaChndCkpdGhyb3cgbmV3IFooImtleSAiK2YrIiBtdXN0IG5vdCBjb250YWluIG51bGwgYnl0ZXMiKTtpZihuKXtpZigiJCI9PT1mWzBdKXRocm93IG5ldyBaKCJrZXkgIitmKyIgbXVzdCBub3Qgc3RhcnQgd2l0aCAnJCciKTtpZihmLmluY2x1ZGVzKCIuIikpdGhyb3cgbmV3IFooImtleSAiK2YrIiBtdXN0IG5vdCBjb250YWluICcuJyIpfX1pZih2b2lkIDA9PT11KSExPT09cyYmKGM9cHQoZSxmLDAsYykpO2Vsc2UgaWYobnVsbD09PXUpYz1wdChlLGYsMCxjKTtlbHNlIGlmKCJzdHJpbmciPT09ZyljPWJ0KGUsZix1LGMpO2Vsc2UgaWYoIm51bWJlciI9PT1nKWM9ZHQoZSxmLHUsYyk7ZWxzZSBpZigiYmlnaW50Ij09PWcpYz13dChlLGYsdSxjKTtlbHNlIGlmKCJib29sZWFuIj09PWcpYz15dChlLGYsdSxjKTtlbHNlIGlmKCJvYmplY3QiPT09ZyYmbnVsbD09dS5fYnNvbnR5cGUpYz11IGluc3RhbmNlb2YgRGF0ZXx8ZCh1KT9tdChlLGYsdSxjKTp1IGluc3RhbmNlb2YgVWludDhBcnJheXx8Xyh1KT9VdChlLGYsdSxjKTp1IGluc3RhbmNlb2YgUmVnRXhwfHxoKHUpP1N0KGUsZix1LGMpOk90KGUsZix1LGMsbixpLG8scyxhKTtlbHNlIGlmKCJvYmplY3QiPT09Zyl7aWYodVt5XSE9PXApdGhyb3cgbmV3IEc7aWYoIk9iamVjdElkIj09PXUuX2Jzb250eXBlKWM9RXQoZSxmLHUsYyk7ZWxzZSBpZigiRGVjaW1hbDEyOCI9PT11Ll9ic29udHlwZSljPU50KGUsZix1LGMpO2Vsc2UgaWYoIkxvbmciPT09dS5fYnNvbnR5cGV8fCJUaW1lc3RhbXAiPT09dS5fYnNvbnR5cGUpYz1JdChlLGYsdSxjKTtlbHNlIGlmKCJEb3VibGUiPT09dS5fYnNvbnR5cGUpYz1UdChlLGYsdSxjKTtlbHNlIGlmKCJDb2RlIj09PXUuX2Jzb250eXBlKWM9THQoZSxmLHUsYyxuLGksbyxzLGEpO2Vsc2UgaWYoIkJpbmFyeSI9PT11Ll9ic29udHlwZSljPUF0KGUsZix1LGMpO2Vsc2UgaWYoIkJTT05TeW1ib2wiPT09dS5fYnNvbnR5cGUpYz1SdChlLGYsdSxjKTtlbHNlIGlmKCJEQlJlZiI9PT11Ll9ic29udHlwZSljPWp0KGUsZix1LGMsaSxvLGEpO2Vsc2UgaWYoIkJTT05SZWdFeHAiPT09dS5fYnNvbnR5cGUpYz1CdChlLGYsdSxjKTtlbHNlIGlmKCJJbnQzMiI9PT11Ll9ic29udHlwZSljPXZ0KGUsZix1LGMpO2Vsc2UgaWYoIk1pbktleSI9PT11Ll9ic29udHlwZXx8Ik1heEtleSI9PT11Ll9ic29udHlwZSljPXh0KGUsZix1LGMpO2Vsc2UgaWYodm9pZCAwIT09dS5fYnNvbnR5cGUpdGhyb3cgbmV3IFooYFVucmVjb2duaXplZCBvciBpbnZhbGlkIF9ic29udHlwZTogJHtTdHJpbmcodS5fYnNvbnR5cGUpfWApfWVsc2UiZnVuY3Rpb24iPT09ZyYmbyYmKGM9JHQoZSxmLHUsYykpfX1lbHNle2lmKCJmdW5jdGlvbiI9PXR5cGVvZiB0Py50b0JTT04mJm51bGwhPSh0PXQudG9CU09OKCkpJiYib2JqZWN0IiE9dHlwZW9mIHQpdGhyb3cgbmV3IFooInRvQlNPTiBmdW5jdGlvbiBkaWQgbm90IHJldHVybiBhbiBvYmplY3QiKTtmb3IoY29uc3QgciBvZiBPYmplY3Qua2V5cyh0KSl7bGV0IGw9dFtyXTsiZnVuY3Rpb24iPT10eXBlb2YgbD8udG9CU09OJiYobD1sLnRvQlNPTigpKTtjb25zdCBmPXR5cGVvZiBsO2lmKCJzdHJpbmciPT10eXBlb2YgciYmIWh0LmhhcyhyKSl7aWYobnVsbCE9ci5tYXRjaChndCkpdGhyb3cgbmV3IFooImtleSAiK3IrIiBtdXN0IG5vdCBjb250YWluIG51bGwgYnl0ZXMiKTtpZihuKXtpZigiJCI9PT1yWzBdKXRocm93IG5ldyBaKCJrZXkgIityKyIgbXVzdCBub3Qgc3RhcnQgd2l0aCAnJCciKTtpZihyLmluY2x1ZGVzKCIuIikpdGhyb3cgbmV3IFooImtleSAiK3IrIiBtdXN0IG5vdCBjb250YWluICcuJyIpfX1pZih2b2lkIDA9PT1sKSExPT09cyYmKGM9cHQoZSxyLDAsYykpO2Vsc2UgaWYobnVsbD09PWwpYz1wdChlLHIsMCxjKTtlbHNlIGlmKCJzdHJpbmciPT09ZiljPWJ0KGUscixsLGMpO2Vsc2UgaWYoIm51bWJlciI9PT1mKWM9ZHQoZSxyLGwsYyk7ZWxzZSBpZigiYmlnaW50Ij09PWYpYz13dChlLHIsbCxjKTtlbHNlIGlmKCJib29sZWFuIj09PWYpYz15dChlLHIsbCxjKTtlbHNlIGlmKCJvYmplY3QiPT09ZiYmbnVsbD09bC5fYnNvbnR5cGUpYz1sIGluc3RhbmNlb2YgRGF0ZXx8ZChsKT9tdChlLHIsbCxjKTpsIGluc3RhbmNlb2YgVWludDhBcnJheXx8XyhsKT9VdChlLHIsbCxjKTpsIGluc3RhbmNlb2YgUmVnRXhwfHxoKGwpP1N0KGUscixsLGMpOk90KGUscixsLGMsbixpLG8scyxhKTtlbHNlIGlmKCJvYmplY3QiPT09Zil7aWYobFt5XSE9PXApdGhyb3cgbmV3IEc7aWYoIk9iamVjdElkIj09PWwuX2Jzb250eXBlKWM9RXQoZSxyLGwsYyk7ZWxzZSBpZigiRGVjaW1hbDEyOCI9PT1sLl9ic29udHlwZSljPU50KGUscixsLGMpO2Vsc2UgaWYoIkxvbmciPT09bC5fYnNvbnR5cGV8fCJUaW1lc3RhbXAiPT09bC5fYnNvbnR5cGUpYz1JdChlLHIsbCxjKTtlbHNlIGlmKCJEb3VibGUiPT09bC5fYnNvbnR5cGUpYz1UdChlLHIsbCxjKTtlbHNlIGlmKCJDb2RlIj09PWwuX2Jzb250eXBlKWM9THQoZSxyLGwsYyxuLGksbyxzLGEpO2Vsc2UgaWYoIkJpbmFyeSI9PT1sLl9ic29udHlwZSljPUF0KGUscixsLGMpO2Vsc2UgaWYoIkJTT05TeW1ib2wiPT09bC5fYnNvbnR5cGUpYz1SdChlLHIsbCxjKTtlbHNlIGlmKCJEQlJlZiI9PT1sLl9ic29udHlwZSljPWp0KGUscixsLGMsaSxvLGEpO2Vsc2UgaWYoIkJTT05SZWdFeHAiPT09bC5fYnNvbnR5cGUpYz1CdChlLHIsbCxjKTtlbHNlIGlmKCJJbnQzMiI9PT1sLl9ic29udHlwZSljPXZ0KGUscixsLGMpO2Vsc2UgaWYoIk1pbktleSI9PT1sLl9ic29udHlwZXx8Ik1heEtleSI9PT1sLl9ic29udHlwZSljPXh0KGUscixsLGMpO2Vsc2UgaWYodm9pZCAwIT09bC5fYnNvbnR5cGUpdGhyb3cgbmV3IFooYFVucmVjb2duaXplZCBvciBpbnZhbGlkIF9ic29udHlwZTogJHtTdHJpbmcobC5fYnNvbnR5cGUpfWApfWVsc2UiZnVuY3Rpb24iPT09ZiYmbyYmKGM9JHQoZSxyLGwsYykpfX1hLmRlbGV0ZSh0KSxlW2MrK109MDtjb25zdCBsPWMtcjtyZXR1cm4gcis9cGUuc2V0SW50MzJMRShlLHIsbCksY31jb25zdCBrdD17JG9pZDp0dCwkYmluYXJ5OnllLCR1dWlkOnllLCRzeW1ib2w6b3QsJG51bWJlckludDpaZSwkbnVtYmVyRGVjaW1hbDpIZSwkbnVtYmVyRG91YmxlOktlLCRudW1iZXJMb25nOmplLCRtaW5LZXk6WGUsJG1heEtleTpHZSwkcmVnZXg6aXQsJHJlZ3VsYXJFeHByZXNzaW9uOml0LCR0aW1lc3RhbXA6YXR9O2Z1bmN0aW9uIHp0KGUsdD17fSl7aWYoIm51bWJlciI9PXR5cGVvZiBlKXtjb25zdCBuPWU8PW0mJmU+PVMscj1lPD1CJiZlPj14O2lmKHQucmVsYXhlZHx8dC5sZWdhY3kpcmV0dXJuIGU7aWYoTnVtYmVyLmlzSW50ZWdlcihlKSYmIU9iamVjdC5pcyhlLC0wKSl7aWYobilyZXR1cm4gbmV3IFplKGUpO2lmKHIpcmV0dXJuIHQudXNlQmlnSW50NjQ/QmlnSW50KGUpOmplLmZyb21OdW1iZXIoZSl9cmV0dXJuIG5ldyBLZShlKX1pZihudWxsPT1lfHwib2JqZWN0IiE9dHlwZW9mIGUpcmV0dXJuIGU7aWYoZS4kdW5kZWZpbmVkKXJldHVybiBudWxsO2NvbnN0IG49T2JqZWN0LmtleXMoZSkuZmlsdGVyKCh0PT50LnN0YXJ0c1dpdGgoIiQiKSYmbnVsbCE9ZVt0XSkpO2ZvcihsZXQgcj0wO3I8bi5sZW5ndGg7cisrKXtjb25zdCBpPWt0W25bcl1dO2lmKGkpcmV0dXJuIGkuZnJvbUV4dGVuZGVkSlNPTihlLHQpfWlmKG51bGwhPWUuJGRhdGUpe2NvbnN0IG49ZS4kZGF0ZSxyPW5ldyBEYXRlO2lmKHQubGVnYWN5KWlmKCJudW1iZXIiPT10eXBlb2YgbilyLnNldFRpbWUobik7ZWxzZSBpZigic3RyaW5nIj09dHlwZW9mIG4pci5zZXRUaW1lKERhdGUucGFyc2UobikpO2Vsc2V7aWYoImJpZ2ludCIhPXR5cGVvZiBuKXRocm93IG5ldyBYKCJVbnJlY29nbml6ZWQgdHlwZSBmb3IgRUpTT04gZGF0ZTogIit0eXBlb2Ygbik7ci5zZXRUaW1lKE51bWJlcihuKSl9ZWxzZSBpZigic3RyaW5nIj09dHlwZW9mIG4pci5zZXRUaW1lKERhdGUucGFyc2UobikpO2Vsc2UgaWYoamUuaXNMb25nKG4pKXIuc2V0VGltZShuLnRvTnVtYmVyKCkpO2Vsc2UgaWYoIm51bWJlciI9PXR5cGVvZiBuJiZ0LnJlbGF4ZWQpci5zZXRUaW1lKG4pO2Vsc2V7aWYoImJpZ2ludCIhPXR5cGVvZiBuKXRocm93IG5ldyBYKCJVbnJlY29nbml6ZWQgdHlwZSBmb3IgRUpTT04gZGF0ZTogIit0eXBlb2Ygbik7ci5zZXRUaW1lKE51bWJlcihuKSl9cmV0dXJuIHJ9aWYobnVsbCE9ZS4kY29kZSl7Y29uc3QgdD1PYmplY3QuYXNzaWduKHt9LGUpO3JldHVybiBlLiRzY29wZSYmKHQuJHNjb3BlPXp0KGUuJHNjb3BlKSksRWUuZnJvbUV4dGVuZGVkSlNPTihlKX1pZihVZShlKXx8ZS4kZGJQb2ludGVyKXtjb25zdCB0PWUuJHJlZj9lOmUuJGRiUG9pbnRlcjtpZih0IGluc3RhbmNlb2YgT2UpcmV0dXJuIHQ7Y29uc3Qgbj1PYmplY3Qua2V5cyh0KS5maWx0ZXIoKGU9PmUuc3RhcnRzV2l0aCgiJCIpKSk7bGV0IHI9ITA7aWYobi5mb3JFYWNoKChlPT57LTE9PT1bIiRyZWYiLCIkaWQiLCIkZGIiXS5pbmRleE9mKGUpJiYocj0hMSl9KSkscilyZXR1cm4gT2UuZnJvbUV4dGVuZGVkSlNPTih0KX1yZXR1cm4gZX1mdW5jdGlvbiBEdChlKXtjb25zdCB0PWUudG9JU09TdHJpbmcoKTtyZXR1cm4gMCE9PWUuZ2V0VVRDTWlsbGlzZWNvbmRzKCk/dDp0LnNsaWNlKDAsLTUpKyJaIn1mdW5jdGlvbiBDdChlLHQpe2lmKGUgaW5zdGFuY2VvZiBNYXB8fGIoZSkpe2NvbnN0IG49T2JqZWN0LmNyZWF0ZShudWxsKTtmb3IoY29uc3RbdCxyXW9mIGUpe2lmKCJzdHJpbmciIT10eXBlb2YgdCl0aHJvdyBuZXcgWigiQ2FuIG9ubHkgc2VyaWFsaXplIG1hcHMgd2l0aCBzdHJpbmcga2V5cyIpO25bdF09cn1yZXR1cm4gQ3Qobix0KX1pZigoIm9iamVjdCI9PXR5cGVvZiBlfHwiZnVuY3Rpb24iPT10eXBlb2YgZSkmJm51bGwhPT1lKXtjb25zdCBuPXQuc2Vlbk9iamVjdHMuZmluZEluZGV4KCh0PT50Lm9iaj09PWUpKTtpZigtMSE9PW4pe2NvbnN0IGU9dC5zZWVuT2JqZWN0cy5tYXAoKGU9PmUucHJvcGVydHlOYW1lKSkscj1lLnNsaWNlKDAsbikubWFwKChlPT5gJHtlfSAtPiBgKSkuam9pbigiIiksaT1lW25dLG89IiAtPiAiK2Uuc2xpY2UobisxLGUubGVuZ3RoLTEpLm1hcCgoZT0+YCR7ZX0gLT4gYCkpLmpvaW4oIiIpLHM9ZVtlLmxlbmd0aC0xXSxhPSIgIi5yZXBlYXQoci5sZW5ndGgraS5sZW5ndGgvMiksYz0iLSIucmVwZWF0KG8ubGVuZ3RoKyhpLmxlbmd0aCtzLmxlbmd0aCkvMi0xKTt0aHJvdyBuZXcgWihgQ29udmVydGluZyBjaXJjdWxhciBzdHJ1Y3R1cmUgdG8gRUpTT046XG4gICAgJHtyfSR7aX0ke299JHtzfVxuICAgICR7YX1cXCR7Y30vYCl9dC5zZWVuT2JqZWN0c1t0LnNlZW5PYmplY3RzLmxlbmd0aC0xXS5vYmo9ZX1pZihBcnJheS5pc0FycmF5KGUpKXJldHVybiBmdW5jdGlvbihlLHQpe3JldHVybiBlLm1hcCgoKGUsbik9Pnt0LnNlZW5PYmplY3RzLnB1c2goe3Byb3BlcnR5TmFtZTpgaW5kZXggJHtufWAsb2JqOm51bGx9KTt0cnl7cmV0dXJuIEN0KGUsdCl9ZmluYWxseXt0LnNlZW5PYmplY3RzLnBvcCgpfX0pKX0oZSx0KTtpZih2b2lkIDA9PT1lKXJldHVybiB0Lmlnbm9yZVVuZGVmaW5lZD92b2lkIDA6bnVsbDtpZihlIGluc3RhbmNlb2YgRGF0ZXx8ZChlKSl7Y29uc3Qgbj1lLmdldFRpbWUoKSxyPW4+LTEmJm48MjUzNDAyMzE4OGU1O3JldHVybiB0LmxlZ2FjeT90LnJlbGF4ZWQmJnI/eyRkYXRlOmUuZ2V0VGltZSgpfTp7JGRhdGU6RHQoZSl9OnQucmVsYXhlZCYmcj97JGRhdGU6RHQoZSl9OnskZGF0ZTp7JG51bWJlckxvbmc6ZS5nZXRUaW1lKCkudG9TdHJpbmcoKX19fWlmKCEoIm51bWJlciIhPXR5cGVvZiBlfHx0LnJlbGF4ZWQmJmlzRmluaXRlKGUpKSl7aWYoTnVtYmVyLmlzSW50ZWdlcihlKSYmIU9iamVjdC5pcyhlLC0wKSl7aWYoZT49UyYmZTw9bSlyZXR1cm57JG51bWJlckludDplLnRvU3RyaW5nKCl9O2lmKGU+PXgmJmU8PUIpcmV0dXJueyRudW1iZXJMb25nOmUudG9TdHJpbmcoKX19cmV0dXJueyRudW1iZXJEb3VibGU6T2JqZWN0LmlzKGUsLTApPyItMC4wIjplLnRvU3RyaW5nKCl9fWlmKCJiaWdpbnQiPT10eXBlb2YgZSlyZXR1cm4gdC5yZWxheGVkP051bWJlcihCaWdJbnQuYXNJbnROKDY0LGUpKTp7JG51bWJlckxvbmc6QmlnSW50LmFzSW50Tig2NCxlKS50b1N0cmluZygpfTtpZihlIGluc3RhbmNlb2YgUmVnRXhwfHxoKGUpKXtsZXQgbj1lLmZsYWdzO2lmKHZvaWQgMD09PW4pe2NvbnN0IHQ9ZS50b1N0cmluZygpLm1hdGNoKC9bZ2ltdXldKiQvKTt0JiYobj10WzBdKX1yZXR1cm4gbmV3IGl0KGUuc291cmNlLG4pLnRvRXh0ZW5kZWRKU09OKHQpfXJldHVybiBudWxsIT1lJiYib2JqZWN0Ij09dHlwZW9mIGU/ZnVuY3Rpb24oZSx0KXtpZihudWxsPT1lfHwib2JqZWN0IiE9dHlwZW9mIGUpdGhyb3cgbmV3IFooIm5vdCBhbiBvYmplY3QgaW5zdGFuY2UiKTtjb25zdCBuPWUuX2Jzb250eXBlO2lmKHZvaWQgMD09PW4pe2NvbnN0IG49e307Zm9yKGNvbnN0IHIgb2YgT2JqZWN0LmtleXMoZSkpe3Quc2Vlbk9iamVjdHMucHVzaCh7cHJvcGVydHlOYW1lOnIsb2JqOm51bGx9KTt0cnl7Y29uc3QgaT1DdChlW3JdLHQpOyJfX3Byb3RvX18iPT09cj9PYmplY3QuZGVmaW5lUHJvcGVydHkobixyLHt2YWx1ZTppLHdyaXRhYmxlOiEwLGVudW1lcmFibGU6ITAsY29uZmlndXJhYmxlOiEwfSk6bltyXT1pfWZpbmFsbHl7dC5zZWVuT2JqZWN0cy5wb3AoKX19cmV0dXJuIG59aWYobnVsbCE9ZSYmIm9iamVjdCI9PXR5cGVvZiBlJiYic3RyaW5nIj09dHlwZW9mIGUuX2Jzb250eXBlJiZlW3ldIT09cCl0aHJvdyBuZXcgRztpZihmdW5jdGlvbihlKXtyZXR1cm4gbnVsbCE9ZSYmIm9iamVjdCI9PXR5cGVvZiBlJiYiX2Jzb250eXBlImluIGUmJiJzdHJpbmciPT10eXBlb2YgZS5fYnNvbnR5cGV9KGUpKXtsZXQgcj1lO2lmKCJmdW5jdGlvbiIhPXR5cGVvZiByLnRvRXh0ZW5kZWRKU09OKXtjb25zdCB0PU10W2UuX2Jzb250eXBlXTtpZighdCl0aHJvdyBuZXcgWigiVW5yZWNvZ25pemVkIG9yIGludmFsaWQgX2Jzb250eXBlOiAiK2UuX2Jzb250eXBlKTtyPXQocil9cmV0dXJuIkNvZGUiPT09biYmci5zY29wZT9yPW5ldyBFZShyLmNvZGUsQ3Qoci5zY29wZSx0KSk6IkRCUmVmIj09PW4mJnIub2lkJiYocj1uZXcgT2UoQ3Qoci5jb2xsZWN0aW9uLHQpLEN0KHIub2lkLHQpLEN0KHIuZGIsdCksQ3Qoci5maWVsZHMsdCkpKSxyLnRvRXh0ZW5kZWRKU09OKHQpfXRocm93IG5ldyBaKCJfYnNvbnR5cGUgbXVzdCBiZSBhIHN0cmluZywgYnV0IHdhczogIit0eXBlb2Ygbil9KGUsdCk6ZX1jb25zdCBNdD17QmluYXJ5OmU9Pm5ldyB5ZShlLnZhbHVlKCksZS5zdWJfdHlwZSksQ29kZTplPT5uZXcgRWUoZS5jb2RlLGUuc2NvcGUpLERCUmVmOmU9Pm5ldyBPZShlLmNvbGxlY3Rpb258fGUubmFtZXNwYWNlLGUub2lkLGUuZGIsZS5maWVsZHMpLERlY2ltYWwxMjg6ZT0+bmV3IEhlKGUuYnl0ZXMpLERvdWJsZTplPT5uZXcgS2UoZS52YWx1ZSksSW50MzI6ZT0+bmV3IFplKGUudmFsdWUpLExvbmc6ZT0+amUuZnJvbUJpdHMobnVsbCE9ZS5sb3c/ZS5sb3c6ZS5sb3dfLG51bGwhPWUubG93P2UuaGlnaDplLmhpZ2hfLG51bGwhPWUubG93P2UudW5zaWduZWQ6ZS51bnNpZ25lZF8pLE1heEtleTooKT0+bmV3IEdlLE1pbktleTooKT0+bmV3IFhlLE9iamVjdElkOmU9Pm5ldyB0dChlKSxCU09OUmVnRXhwOmU9Pm5ldyBpdChlLnBhdHRlcm4sZS5vcHRpb25zKSxCU09OU3ltYm9sOmU9Pm5ldyBvdChlLnZhbHVlKSxUaW1lc3RhbXA6ZT0+YXQuZnJvbUJpdHMoZS5sb3csZS5oaWdoKX07ZnVuY3Rpb24gVnQoZSx0KXtjb25zdCBuPXt1c2VCaWdJbnQ2NDp0Py51c2VCaWdJbnQ2ND8/ITEscmVsYXhlZDp0Py5yZWxheGVkPz8hMCxsZWdhY3k6dD8ubGVnYWN5Pz8hMX07cmV0dXJuIEpTT04ucGFyc2UoZSwoKGUsdCk9PntpZigtMSE9PWUuaW5kZXhPZigiXDAiKSl0aHJvdyBuZXcgWihgQlNPTiBEb2N1bWVudCBmaWVsZCBuYW1lcyBjYW5ub3QgY29udGFpbiBudWxsIGJ5dGVzLCBmb3VuZDogJHtKU09OLnN0cmluZ2lmeShlKX1gKTtyZXR1cm4genQodCxuKX0pKX1mdW5jdGlvbiBQdChlLHQsbixyKXtudWxsIT1uJiYib2JqZWN0Ij09dHlwZW9mIG4mJihyPW4sbj0wKSxudWxsPT10fHwib2JqZWN0IiE9dHlwZW9mIHR8fEFycmF5LmlzQXJyYXkodCl8fChyPXQsdD12b2lkIDAsbj0wKTtjb25zdCBpPUN0KGUsT2JqZWN0LmFzc2lnbih7cmVsYXhlZDohMCxsZWdhY3k6ITF9LHIse3NlZW5PYmplY3RzOlt7cHJvcGVydHlOYW1lOiIocm9vdCkiLG9iajpudWxsfV19KSk7cmV0dXJuIEpTT04uc3RyaW5naWZ5KGksdCxuKX1jb25zdCBKdD1PYmplY3QuY3JlYXRlKG51bGwpO0p0LnBhcnNlPVZ0LEp0LnN0cmluZ2lmeT1QdCxKdC5zZXJpYWxpemU9ZnVuY3Rpb24oZSx0KXtyZXR1cm4gdD10fHx7fSxKU09OLnBhcnNlKFB0KGUsdCkpfSxKdC5kZXNlcmlhbGl6ZT1mdW5jdGlvbihlLHQpe3JldHVybiB0PXR8fHt9LFZ0KEpTT04uc3RyaW5naWZ5KGUpLHQpfSxPYmplY3QuZnJlZXplKEp0KTtjb25zdCBXdD0xLFl0PTIscXQ9MyxIdD00LEt0PTUsWnQ9NixHdD03LFh0PTgsUXQ9OSxlbj0xMCx0bj0xMSxubj0xMixybj0xMyxvbj0xNCxzbj0xNSxhbj0xNixjbj0xNyxsbj0xOCxmbj0xOSx1bj0yNTUsX249MTI3O2Z1bmN0aW9uIGduKGUsdCl7dHJ5e3JldHVybiBwZS5nZXROb25uZWdhdGl2ZUludDMyTEUoZSx0KX1jYXRjaChlKXt0aHJvdyBuZXcgUSgiQlNPTiBzaXplIGNhbm5vdCBiZSBuZWdhdGl2ZSIsdCx7Y2F1c2U6ZX0pfX1mdW5jdGlvbiBobihlLHQpe2xldCBuPXQ7Zm9yKDswIT09ZVtuXTtuKyspO2lmKG49PT1lLmxlbmd0aC0xKXRocm93IG5ldyBRKCJOdWxsIHRlcm1pbmF0b3Igbm90IGZvdW5kIix0KTtyZXR1cm4gbn1jb25zdCBibj1PYmplY3QuY3JlYXRlKG51bGwpO2JuLnBhcnNlVG9FbGVtZW50cz1mdW5jdGlvbihlLHQ9MCl7aWYodD8/PTAsZS5sZW5ndGg8NSl0aHJvdyBuZXcgUShgSW5wdXQgbXVzdCBiZSBhdCBsZWFzdCA1IGJ5dGVzLCBnb3QgJHtlLmxlbmd0aH0gYnl0ZXNgLHQpO2NvbnN0IG49Z24oZSx0KTtpZihuPmUubGVuZ3RoLXQpdGhyb3cgbmV3IFEoYFBhcnNlZCBkb2N1bWVudFNpemUgKCR7bn0gYnl0ZXMpIGRvZXMgbm90IG1hdGNoIGlucHV0IGxlbmd0aCAoJHtlLmxlbmd0aH0gYnl0ZXMpYCx0KTtpZigwIT09ZVt0K24tMV0pdGhyb3cgbmV3IFEoIkJTT04gZG9jdW1lbnRzIG11c3QgZW5kIGluIDB4MDAiLHQrbik7Y29uc3Qgcj1bXTtsZXQgaT10KzQ7Zm9yKDtpPD1uK3Q7KXtjb25zdCBvPWVbaV07aWYoaSs9MSwwPT09byl7aWYoaS10IT09bil0aHJvdyBuZXcgUSgiSW52YWxpZCAweDAwIHR5cGUgYnl0ZSIsaSk7YnJlYWt9Y29uc3Qgcz1pLGE9aG4oZSxpKS1zO2xldCBjO2lmKGkrPWErMSxvPT09V3R8fG89PT1sbnx8bz09PVF0fHxvPT09Y24pYz04O2Vsc2UgaWYobz09PWFuKWM9NDtlbHNlIGlmKG89PT1HdCljPTEyO2Vsc2UgaWYobz09PWZuKWM9MTY7ZWxzZSBpZihvPT09WHQpYz0xO2Vsc2UgaWYobz09PWVufHxvPT09WnR8fG89PT1fbnx8bz09PXVuKWM9MDtlbHNlIGlmKG89PT10biljPWhuKGUsaG4oZSxpKSsxKSsxLWk7ZWxzZSBpZihvPT09cXR8fG89PT1IdHx8bz09PXNuKWM9Z24oZSxpKTtlbHNle2lmKG8hPT1ZdCYmbyE9PUt0JiZvIT09bm4mJm8hPT1ybiYmbyE9PW9uKXRocm93IG5ldyBRKGBJbnZhbGlkIDB4JHtvLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCIwIil9IHR5cGUgYnl0ZWAsaSk7Yz1nbihlLGkpKzQsbz09PUt0JiYoYys9MSksbz09PW5uJiYoYys9MTIpfWlmKGM+bil0aHJvdyBuZXcgUSgidmFsdWUgcmVwb3J0cyBsZW5ndGggbGFyZ2VyIHRoYW4gZG9jdW1lbnQiLGkpO3IucHVzaChbbyxzLGEsaSxjXSksaSs9Y31yZXR1cm4gcn0sYm4uQnl0ZVV0aWxzPV9lLGJuLk51bWJlclV0aWxzPXBlLE9iamVjdC5mcmVlemUoYm4pO2NvbnN0IGRuPTE3ODI1NzkyO2xldCB3bj1fZS5hbGxvY2F0ZShkbik7dmFyIHBuPU9iamVjdC5mcmVlemUoe19fcHJvdG9fXzpudWxsLEJTT05FcnJvcjpaLEJTT05PZmZzZXRFcnJvcjpRLEJTT05SZWdFeHA6aXQsQlNPTlJ1bnRpbWVFcnJvcjpYLEJTT05TeW1ib2w6b3QsQlNPTlR5cGU6SyxCU09OVmFsdWU6aGUsQlNPTlZlcnNpb25FcnJvcjpHLEJpbmFyeTp5ZSxCeXRlVXRpbHM6X2UsQ29kZTpFZSxEQlJlZjpPZSxEZWNpbWFsMTI4OkhlLERvdWJsZTpLZSxFSlNPTjpKdCxJbnQzMjpaZSxMb25nOmplLE1heEtleTpHZSxNaW5LZXk6WGUsTnVtYmVyVXRpbHM6cGUsT2JqZWN0SWQ6dHQsVGltZXN0YW1wOmF0LFVVSUQ6eGUsYnNvblR5cGU6Z2UsY2FsY3VsYXRlT2JqZWN0U2l6ZTpmdW5jdGlvbihlLHQ9e30pe3JldHVybiBudChlLCJib29sZWFuIj09dHlwZW9mKHQ9dHx8e30pLnNlcmlhbGl6ZUZ1bmN0aW9ucyYmdC5zZXJpYWxpemVGdW5jdGlvbnMsImJvb2xlYW4iIT10eXBlb2YgdC5pZ25vcmVVbmRlZmluZWR8fHQuaWdub3JlVW5kZWZpbmVkKX0sZGVzZXJpYWxpemU6ZnVuY3Rpb24oZSx0PXt9KXtyZXR1cm4gZnQoX2UudG9Mb2NhbEJ1ZmZlclR5cGUoZSksdCl9LGRlc2VyaWFsaXplU3RyZWFtOmZ1bmN0aW9uKGUsdCxuLHIsaSxvKXtjb25zdCBzPU9iamVjdC5hc3NpZ24oe2FsbG93T2JqZWN0U21hbGxlclRoYW5CdWZmZXJTaXplOiEwLGluZGV4OjB9LG8pLGE9X2UudG9Mb2NhbEJ1ZmZlclR5cGUoZSk7bGV0IGM9dDtmb3IobGV0IGU9MDtlPG47ZSsrKXtjb25zdCB0PXBlLmdldEludDMyTEUoYSxjKTtzLmluZGV4PWMscltpK2VdPWZ0KGEscyksYys9dH1yZXR1cm4gY30sb25EZW1hbmQ6Ym4sc2VyaWFsaXplOmZ1bmN0aW9uKGUsdD17fSl7Y29uc3Qgbj0iYm9vbGVhbiI9PXR5cGVvZiB0LmNoZWNrS2V5cyYmdC5jaGVja0tleXMscj0iYm9vbGVhbiI9PXR5cGVvZiB0LnNlcmlhbGl6ZUZ1bmN0aW9ucyYmdC5zZXJpYWxpemVGdW5jdGlvbnMsaT0iYm9vbGVhbiIhPXR5cGVvZiB0Lmlnbm9yZVVuZGVmaW5lZHx8dC5pZ25vcmVVbmRlZmluZWQsbz0ibnVtYmVyIj09dHlwZW9mIHQubWluSW50ZXJuYWxCdWZmZXJTaXplP3QubWluSW50ZXJuYWxCdWZmZXJTaXplOmRuO3duLmxlbmd0aDxvJiYod249X2UuYWxsb2NhdGUobykpO2NvbnN0IHM9RnQod24sZSxuLDAsMCxyLGksbnVsbCksYT1fZS5hbGxvY2F0ZVVuc2FmZShzKTtyZXR1cm4gYS5zZXQod24uc3ViYXJyYXkoMCxzKSwwKSxhfSxzZXJpYWxpemVXaXRoQnVmZmVyQW5kSW5kZXg6ZnVuY3Rpb24oZSx0LG49e30pe2NvbnN0IHI9ImJvb2xlYW4iPT10eXBlb2Ygbi5jaGVja0tleXMmJm4uY2hlY2tLZXlzLGk9ImJvb2xlYW4iPT10eXBlb2Ygbi5zZXJpYWxpemVGdW5jdGlvbnMmJm4uc2VyaWFsaXplRnVuY3Rpb25zLG89ImJvb2xlYW4iIT10eXBlb2Ygbi5pZ25vcmVVbmRlZmluZWR8fG4uaWdub3JlVW5kZWZpbmVkLHM9Im51bWJlciI9PXR5cGVvZiBuLmluZGV4P24uaW5kZXg6MCxhPUZ0KHduLGUsciwwLDAsaSxvLG51bGwpO3JldHVybiB0LnNldCh3bi5zdWJhcnJheSgwLGEpLHMpLHMrYS0xfSxzZXRJbnRlcm5hbEJ1ZmZlclNpemU6ZnVuY3Rpb24oZSl7d24ubGVuZ3RoPGUmJih3bj1fZS5hbGxvY2F0ZShlKSl9fSk7Y2xhc3MgeW57Y29uc3RydWN0b3IoKXt9c3RhdGljIHVybENvbnN0cnVjdEZyb20oZSl7Y29uc3QgdD0iL3dzL21vZGVsaW5nL2NvbW1hbmRzIitmdW5jdGlvbihlKXtjb25zdCB0PW5ldyBVUkxTZWFyY2hQYXJhbXM7Zm9yKGNvbnN0W24scl1vZiBPYmplY3QuZW50cmllcyhlKSlpZih2b2lkIDAhPT1yKWlmKEFycmF5LmlzQXJyYXkocikpZm9yKGNvbnN0IGUgb2Ygcil0LmFwcGVuZChuLFN0cmluZyhlKSk7ZWxzZSB0LmFwcGVuZChuLFN0cmluZyhyKSk7Y29uc3Qgbj10LnRvU3RyaW5nKCk7cmV0dXJuIG4/YD8ke259YDoiIn0oe3ZpZGVvX3Jlc193aWR0aDplLnZpZGVvX3Jlc193aWR0aCx2aWRlb19yZXNfaGVpZ2h0OmUudmlkZW9fcmVzX2hlaWdodCxmcHM6ZS5mcHMsdW5sb2NrZWRfZnJhbWVyYXRlOmUudW5sb2NrZWRfZnJhbWVyYXRlLHBvc3RfZWZmZWN0OmUucG9zdF9lZmZlY3Qsd2VicnRjOmUud2VicnRjLHBvb2w6ZS5wb29sLHNob3dfZ3JpZDplLnNob3dfZ3JpZCxyZXBsYXk6ZS5yZXBsYXksYXBpX2NhbGxfaWQ6ZS5hcGlfY2FsbF9pZCxvcmRlcl9pbmRlcGVuZGVudF90cmFuc3BhcmVuY3k6ZS5vcmRlcl9pbmRlcGVuZGVudF90cmFuc3BhcmVuY3kscHI6ZS5wcn0pLG49KChlLmNsaWVudD8uYmFzZVVybHx8Imh0dHBzOi8vYXBpLnpvby5kZXYiKSt0KS5yZXBsYWNlKC9eaHR0cC8sIndzIik7cmV0dXJuIG5ldyBVUkwobil9c3RhdGljIGF1dGhlbnRpY2F0ZShlLHQpe2NvbnN0IG49ZS5jbGllbnQmJmUuY2xpZW50LnRva2VufHwiIjtpZihuKXRyeXtjb25zdCBlPXt0eXBlOiJoZWFkZXJzIixoZWFkZXJzOntBdXRob3JpemF0aW9uOmBCZWFyZXIgJHtufWB9fTt0LnNlbmQoSlNPTi5zdHJpbmdpZnkoZSkpfWNhdGNoe319c3RhdGljIHRvQlNPTihlKXtyZXR1cm4gcG4uc2VyaWFsaXplKGUpfXN0YXRpYyBwYXJzZU1lc3NhZ2UoZSl7Y29uc3QgdD1lPy5kYXRhO2lmKCJzdHJpbmciPT10eXBlb2YgdClyZXR1cm4gSlNPTi5wYXJzZSh0KTtpZigidW5kZWZpbmVkIiE9dHlwZW9mIEJ1ZmZlciYmQnVmZmVyLmlzQnVmZmVyPy4odCkpe2NvbnN0IGU9dDt0cnl7cmV0dXJuIEpTT04ucGFyc2UoZS50b1N0cmluZygidXRmOCIpKX1jYXRjaHt9cmV0dXJuIHBuLmRlc2VyaWFsaXplKGUpfWlmKHQgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcil7Y29uc3QgZT1uZXcgVWludDhBcnJheSh0KTt0cnl7Y29uc3QgdD0obmV3IFRleHREZWNvZGVyKS5kZWNvZGUoZSk7cmV0dXJuIEpTT04ucGFyc2UodCl9Y2F0Y2h7fXJldHVybiBwbi5kZXNlcmlhbGl6ZShlKX1pZigobj10KSYmIm9iamVjdCI9PXR5cGVvZiBuJiYiYnVmZmVyImluIG4mJm4uYnVmZmVyIGluc3RhbmNlb2YgQXJyYXlCdWZmZXImJiJudW1iZXIiPT10eXBlb2Ygbi5ieXRlT2Zmc2V0JiYibnVtYmVyIj09dHlwZW9mIG4uYnl0ZUxlbmd0aCl7Y29uc3QgZT1uZXcgVWludDhBcnJheSh0LmJ1ZmZlcix0LmJ5dGVPZmZzZXQsdC5ieXRlTGVuZ3RoKTt0cnl7Y29uc3QgdD0obmV3IFRleHREZWNvZGVyKS5kZWNvZGUoZSk7cmV0dXJuIEpTT04ucGFyc2UodCl9Y2F0Y2h7fXJldHVybiBwbi5kZXNlcmlhbGl6ZShlKX12YXIgbjtyZXR1cm4gdH19Y2xhc3MgbW57c3RhdGljIF9fd3JhcChlKXtlPj4+PTA7Y29uc3QgdD1PYmplY3QuY3JlYXRlKG1uLnByb3RvdHlwZSk7cmV0dXJuIHQuX193YmdfcHRyPWUsUm4ucmVnaXN0ZXIodCx0Ll9fd2JnX3B0cix0KSx0fV9fZGVzdHJveV9pbnRvX3Jhdygpe2NvbnN0IGU9dGhpcy5fX3diZ19wdHI7cmV0dXJuIHRoaXMuX193YmdfcHRyPTAsUm4udW5yZWdpc3Rlcih0aGlzKSxlfWZyZWUoKXtjb25zdCBlPXRoaXMuX19kZXN0cm95X2ludG9fcmF3KCk7dXIuX193YmdfY29udGV4dF9mcmVlKGUsMCl9YWRkX2NvbnN0cmFpbnQoZSx0LG4scixpKXtjb25zdCBvPW9yKGUsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxzPV9yLGE9b3IodCx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGM9X3IsbD1vcihuLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksZj1fcix1PW9yKHIsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxfPV9yO3JldHVybiB1ci5jb250ZXh0X2FkZF9jb25zdHJhaW50KHRoaXMuX193YmdfcHRyLG8scyxhLGMsbCxmLHUsXyxpKX1hZGRfZmlsZShlLHQpe2NvbnN0IG49b3IodCx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLHI9X3I7cmV0dXJuIHVyLmNvbnRleHRfYWRkX2ZpbGUodGhpcy5fX3diZ19wdHIsZSxuLHIpfWFkZF9zZWdtZW50KGUsdCxuLHIsaSxvKXtjb25zdCBzPW9yKGUsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxhPV9yLGM9b3IodCx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGw9X3IsZj1vcihuLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksdT1fcjt2YXIgXz1ucihyKT8wOm9yKHIsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxnPV9yO2NvbnN0IGg9b3IoaSx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGI9X3I7cmV0dXJuIHVyLmNvbnRleHRfYWRkX3NlZ21lbnQodGhpcy5fX3diZ19wdHIscyxhLGMsbCxmLHUsXyxnLGgsYixvKX1idXN0Q2FjaGVBbmRSZXNldFNjZW5lKGUsdCl7Y29uc3Qgbj1vcihlLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYykscj1fcjt2YXIgaT1ucih0KT8wOm9yKHQsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxvPV9yO3JldHVybiB1ci5jb250ZXh0X2J1c3RDYWNoZUFuZFJlc2V0U2NlbmUodGhpcy5fX3diZ19wdHIsbixyLGksbyl9Y2hhaW5fc2VnbWVudChlLHQsbixyLGksbyxzKXtjb25zdCBhPW9yKGUsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxjPV9yLGw9b3IodCx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGY9X3IsdT1vcihuLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksXz1fcixnPW9yKHIsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxoPV9yO3ZhciBiPW5yKGkpPzA6b3IoaSx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGQ9X3I7Y29uc3Qgdz1vcihvLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYykscD1fcjtyZXR1cm4gdXIuY29udGV4dF9jaGFpbl9zZWdtZW50KHRoaXMuX193YmdfcHRyLGEsYyxsLGYsdSxfLGcsaCxiLGQsdyxwLHMpfWNsZWFyX3NrZXRjaF9jaGVja3BvaW50cygpe3JldHVybiB1ci5jb250ZXh0X2NsZWFyX3NrZXRjaF9jaGVja3BvaW50cyh0aGlzLl9fd2JnX3B0cil9Y2xvbmVXaXRoRXhlY3V0ZUNhbGxiYWNrcyhlKXtjb25zdCB0PXVyLmNvbnRleHRfY2xvbmVXaXRoRXhlY3V0ZUNhbGxiYWNrcyh0aGlzLl9fd2JnX3B0cixlKTtyZXR1cm4gbW4uX193cmFwKHQpfWRlbGV0ZV9vYmplY3RzKGUsdCxuLHIsaSxvKXtjb25zdCBzPW9yKGUsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxhPV9yLGM9b3IodCx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGw9X3IsZj1vcihuLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksdT1fcixfPW9yKHIsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxnPV9yLGg9b3IoaSx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGI9X3I7cmV0dXJuIHVyLmNvbnRleHRfZGVsZXRlX29iamVjdHModGhpcy5fX3diZ19wdHIscyxhLGMsbCxmLHUsXyxnLGgsYixvKX1kZWxldGVfc2tldGNoKGUsdCxuKXtjb25zdCByPW9yKGUsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxpPV9yLG89b3IodCx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLHM9X3IsYT1vcihuLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksYz1fcjtyZXR1cm4gdXIuY29udGV4dF9kZWxldGVfc2tldGNoKHRoaXMuX193YmdfcHRyLHIsaSxvLHMsYSxjKX1lZGl0X2NvbnN0cmFpbnQoZSx0LG4scixpLG8pe2NvbnN0IHM9b3IoZSx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGE9X3IsYz1vcih0LHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksbD1fcixmPW9yKG4sdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSx1PV9yLF89b3Iocix1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGc9X3IsaD1vcihpLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksYj1fcjtyZXR1cm4gdXIuY29udGV4dF9lZGl0X2NvbnN0cmFpbnQodGhpcy5fX3diZ19wdHIscyxhLGMsbCxmLHUsXyxnLGgsYixvKX1lZGl0X2Rpc3RhbmNlX2NvbnN0cmFpbnRfbGFiZWxfcG9zaXRpb24oZSx0LG4scixpLG8scyxhKXtjb25zdCBjPW9yKGUsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxsPV9yLGY9b3IodCx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLHU9X3IsXz1vcihuLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksZz1fcixoPW9yKHIsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxiPV9yLGQ9b3IoaSx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLHc9X3IscD1vcihzLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYykseT1fcjtyZXR1cm4gdXIuY29udGV4dF9lZGl0X2Rpc3RhbmNlX2NvbnN0cmFpbnRfbGFiZWxfcG9zaXRpb24odGhpcy5fX3diZ19wdHIsYyxsLGYsdSxfLGcsaCxiLGQsdyxvLHAseSxhKX1lZGl0X3NlZ21lbnRzKGUsdCxuLHIsaSxvLHMsYSl7Y29uc3QgYz1vcihlLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksbD1fcixmPW9yKHQsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSx1PV9yLF89b3Iobix1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGc9X3IsaD1vcihyLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksYj1fcixkPW9yKG8sdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSx3PV9yLHA9b3Iocyx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLHk9X3I7cmV0dXJuIHVyLmNvbnRleHRfZWRpdF9zZWdtZW50cyh0aGlzLl9fd2JnX3B0cixjLGwsZix1LF8sZyxoLGIsaSxkLHcscCx5LGEpfWVkaXRfc2tldGNoKGUsdCxuLHIsaSl7Y29uc3Qgbz1vcihlLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYykscz1fcixhPW9yKHQsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxjPV9yLGw9b3Iobix1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGY9X3IsdT1vcihyLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksXz1fcixnPW9yKGksdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxoPV9yO3JldHVybiB1ci5jb250ZXh0X2VkaXRfc2tldGNoKHRoaXMuX193YmdfcHRyLG8scyxhLGMsbCxmLHUsXyxnLGgpfWV4ZWN1dGUoZSx0LG4pe2NvbnN0IHI9b3IoZSx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGk9X3I7dmFyIG89bnIodCk/MDpvcih0LHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYykscz1fcjtjb25zdCBhPW9yKG4sdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxjPV9yO3JldHVybiB1ci5jb250ZXh0X2V4ZWN1dGUodGhpcy5fX3diZ19wdHIscixpLG8scyxhLGMpfWV4ZWN1dGVNb2NrKGUsdCxuLHIpe2NvbnN0IGk9b3IoZSx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLG89X3I7dmFyIHM9bnIodCk/MDpvcih0LHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksYT1fcjtjb25zdCBjPW9yKG4sdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxsPV9yO3JldHVybiB1ci5jb250ZXh0X2V4ZWN1dGVNb2NrKHRoaXMuX193YmdfcHRyLGksbyxzLGEsYyxsLHIpfWV4ZWN1dGVfdHJpbShlLHQsbixyKXtjb25zdCBpPW9yKGUsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxvPV9yLHM9b3IodCx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGE9X3IsYz1pcihuLHVyLl9fd2JpbmRnZW5fbWFsbG9jKSxsPV9yLGY9b3Iocix1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLHU9X3I7cmV0dXJuIHVyLmNvbnRleHRfZXhlY3V0ZV90cmltKHRoaXMuX193YmdfcHRyLGksbyxzLGEsYyxsLGYsdSl9ZXhpdF9za2V0Y2goZSx0LG4pe2NvbnN0IHI9b3IoZSx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGk9X3Isbz1vcih0LHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYykscz1fcixhPW9yKG4sdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxjPV9yO3JldHVybiB1ci5jb250ZXh0X2V4aXRfc2tldGNoKHRoaXMuX193YmdfcHRyLHIsaSxvLHMsYSxjKX1leHBvcnQoZSx0KXtjb25zdCBuPW9yKGUsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxyPV9yLGk9b3IodCx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLG89X3I7cmV0dXJuIHVyLmNvbnRleHRfZXhwb3J0KHRoaXMuX193YmdfcHRyLG4scixpLG8pfWdldF9maWxlKGUsdCl7cmV0dXJuIHVyLmNvbnRleHRfZ2V0X2ZpbGUodGhpcy5fX3diZ19wdHIsZSx0KX1nZXRfcHJvamVjdChlKXtyZXR1cm4gdXIuY29udGV4dF9nZXRfcHJvamVjdCh0aGlzLl9fd2JnX3B0cixlKX1oYWNrX3NldF9wcm9ncmFtKGUsdCl7Y29uc3Qgbj1vcihlLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYykscj1fcixpPW9yKHQsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxvPV9yO3JldHVybiB1ci5jb250ZXh0X2hhY2tfc2V0X3Byb2dyYW0odGhpcy5fX3diZ19wdHIsbixyLGksbyl9Y29uc3RydWN0b3IoZSx0LG4pe2NvbnN0IHI9dXIuY29udGV4dF9uZXcoZSx0LG5yKG4pPzA6Vm4obikpO2lmKHJbMl0pdGhyb3cgc3IoclsxXSk7cmV0dXJuIHRoaXMuX193YmdfcHRyPXJbMF0+Pj4wLFJuLnJlZ2lzdGVyKHRoaXMsdGhpcy5fX3diZ19wdHIsdGhpcyksdGhpc31uZXdfc2tldGNoKGUsdCxuLHIsaSl7Y29uc3Qgbz1vcihlLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYykscz1fcixhPW9yKHQsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxjPV9yLGw9b3Iobix1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGY9X3IsdT1vcihyLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksXz1fcixnPW9yKGksdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxoPV9yO3JldHVybiB1ci5jb250ZXh0X25ld19za2V0Y2godGhpcy5fX3diZ19wdHIsbyxzLGEsYyxsLGYsdSxfLGcsaCl9b3Blbl9wcm9qZWN0KGUsdCxuKXtjb25zdCByPW9yKHQsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxpPV9yO3JldHVybiB1ci5jb250ZXh0X29wZW5fcHJvamVjdCh0aGlzLl9fd2JnX3B0cixlLHIsaSxuKX1yZWZyZXNoKGUpe3JldHVybiB1ci5jb250ZXh0X3JlZnJlc2godGhpcy5fX3diZ19wdHIsZSl9cmVtb3ZlX2ZpbGUoZSx0KXtyZXR1cm4gdXIuY29udGV4dF9yZW1vdmVfZmlsZSh0aGlzLl9fd2JnX3B0cixlLHQpfXJlc3RvcmVfc2tldGNoX2NoZWNrcG9pbnQoZSl7Y29uc3QgdD1vcihlLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksbj1fcjtyZXR1cm4gdXIuY29udGV4dF9yZXN0b3JlX3NrZXRjaF9jaGVja3BvaW50KHRoaXMuX193YmdfcHRyLHQsbil9c2VuZFJlc3BvbnNlKGUpe3JldHVybiB1ci5jb250ZXh0X3NlbmRSZXNwb25zZSh0aGlzLl9fd2JnX3B0cixlKX1za2V0Y2hfZXhlY3V0ZV9tb2NrKGUsdCxuKXtjb25zdCByPW9yKGUsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxpPV9yLG89b3IodCx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLHM9X3IsYT1vcihuLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksYz1fcjtyZXR1cm4gdXIuY29udGV4dF9za2V0Y2hfZXhlY3V0ZV9tb2NrKHRoaXMuX193YmdfcHRyLHIsaSxvLHMsYSxjKX1zd2l0Y2hfZmlsZShlLHQpe3JldHVybiB1ci5jb250ZXh0X3N3aXRjaF9maWxlKHRoaXMuX193YmdfcHRyLGUsdCl9dHJhbnNwaWxlX29sZF9za2V0Y2goZSx0LG4scil7Y29uc3QgaT1vcihlLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksbz1fcixzPW9yKHQsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxhPV9yO3ZhciBjPW5yKG4pPzA6b3Iobix1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGw9X3I7Y29uc3QgZj1vcihyLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksdT1fcjtyZXR1cm4gdXIuY29udGV4dF90cmFuc3BpbGVfb2xkX3NrZXRjaCh0aGlzLl9fd2JnX3B0cixpLG8scyxhLGMsbCxmLHUpfXVwZGF0ZV9maWxlKGUsdCxuKXtjb25zdCByPW9yKG4sdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxpPV9yO3JldHVybiB1ci5jb250ZXh0X3VwZGF0ZV9maWxlKHRoaXMuX193YmdfcHRyLGUsdCxyLGkpfX1TeW1ib2wuZGlzcG9zZSYmKG1uLnByb3RvdHlwZVtTeW1ib2wuZGlzcG9zZV09bW4ucHJvdG90eXBlLmZyZWUpO2NsYXNzIFNue19fZGVzdHJveV9pbnRvX3Jhdygpe2NvbnN0IGU9dGhpcy5fX3diZ19wdHI7cmV0dXJuIHRoaXMuX193YmdfcHRyPTAsam4udW5yZWdpc3Rlcih0aGlzKSxlfWZyZWUoKXtjb25zdCBlPXRoaXMuX19kZXN0cm95X2ludG9fcmF3KCk7dXIuX193YmdfaW50b3VuZGVybHlpbmdieXRlc291cmNlX2ZyZWUoZSwwKX1nZXQgYXV0b0FsbG9jYXRlQ2h1bmtTaXplKCl7cmV0dXJuIHVyLmludG91bmRlcmx5aW5nYnl0ZXNvdXJjZV9hdXRvQWxsb2NhdGVDaHVua1NpemUodGhpcy5fX3diZ19wdHIpPj4+MH1jYW5jZWwoKXtjb25zdCBlPXRoaXMuX19kZXN0cm95X2ludG9fcmF3KCk7dXIuaW50b3VuZGVybHlpbmdieXRlc291cmNlX2NhbmNlbChlKX1wdWxsKGUpe3JldHVybiB1ci5pbnRvdW5kZXJseWluZ2J5dGVzb3VyY2VfcHVsbCh0aGlzLl9fd2JnX3B0cixlKX1zdGFydChlKXt1ci5pbnRvdW5kZXJseWluZ2J5dGVzb3VyY2Vfc3RhcnQodGhpcy5fX3diZ19wdHIsZSl9Z2V0IHR5cGUoKXtjb25zdCBlPXVyLmludG91bmRlcmx5aW5nYnl0ZXNvdXJjZV90eXBlKHRoaXMuX193YmdfcHRyKTtyZXR1cm4gQW5bZV19fVN5bWJvbC5kaXNwb3NlJiYoU24ucHJvdG90eXBlW1N5bWJvbC5kaXNwb3NlXT1Tbi5wcm90b3R5cGUuZnJlZSk7Y2xhc3MgQm57X19kZXN0cm95X2ludG9fcmF3KCl7Y29uc3QgZT10aGlzLl9fd2JnX3B0cjtyZXR1cm4gdGhpcy5fX3diZ19wdHI9MCxGbi51bnJlZ2lzdGVyKHRoaXMpLGV9ZnJlZSgpe2NvbnN0IGU9dGhpcy5fX2Rlc3Ryb3lfaW50b19yYXcoKTt1ci5fX3diZ19pbnRvdW5kZXJseWluZ3NpbmtfZnJlZShlLDApfWFib3J0KGUpe2NvbnN0IHQ9dGhpcy5fX2Rlc3Ryb3lfaW50b19yYXcoKTtyZXR1cm4gdXIuaW50b3VuZGVybHlpbmdzaW5rX2Fib3J0KHQsZSl9Y2xvc2UoKXtjb25zdCBlPXRoaXMuX19kZXN0cm95X2ludG9fcmF3KCk7cmV0dXJuIHVyLmludG91bmRlcmx5aW5nc2lua19jbG9zZShlKX13cml0ZShlKXtyZXR1cm4gdXIuaW50b3VuZGVybHlpbmdzaW5rX3dyaXRlKHRoaXMuX193YmdfcHRyLGUpfX1TeW1ib2wuZGlzcG9zZSYmKEJuLnByb3RvdHlwZVtTeW1ib2wuZGlzcG9zZV09Qm4ucHJvdG90eXBlLmZyZWUpO2NsYXNzIHhue19fZGVzdHJveV9pbnRvX3Jhdygpe2NvbnN0IGU9dGhpcy5fX3diZ19wdHI7cmV0dXJuIHRoaXMuX193YmdfcHRyPTAsa24udW5yZWdpc3Rlcih0aGlzKSxlfWZyZWUoKXtjb25zdCBlPXRoaXMuX19kZXN0cm95X2ludG9fcmF3KCk7dXIuX193YmdfaW50b3VuZGVybHlpbmdzb3VyY2VfZnJlZShlLDApfWNhbmNlbCgpe2NvbnN0IGU9dGhpcy5fX2Rlc3Ryb3lfaW50b19yYXcoKTt1ci5pbnRvdW5kZXJseWluZ3NvdXJjZV9jYW5jZWwoZSl9cHVsbChlKXtyZXR1cm4gdXIuaW50b3VuZGVybHlpbmdzb3VyY2VfcHVsbCh0aGlzLl9fd2JnX3B0cixlKX19U3ltYm9sLmRpc3Bvc2UmJih4bi5wcm90b3R5cGVbU3ltYm9sLmRpc3Bvc2VdPXhuLnByb3RvdHlwZS5mcmVlKTtjbGFzcyBFbntfX2Rlc3Ryb3lfaW50b19yYXcoKXtjb25zdCBlPXRoaXMuX193YmdfcHRyO3JldHVybiB0aGlzLl9fd2JnX3B0cj0wLHpuLnVucmVnaXN0ZXIodGhpcyksZX1mcmVlKCl7Y29uc3QgZT10aGlzLl9fZGVzdHJveV9pbnRvX3JhdygpO3VyLl9fd2JnX2xzcHNlcnZlcmNvbmZpZ19mcmVlKGUsMCl9Y29uc3RydWN0b3IoZSx0LG4pe2NvbnN0IHI9dXIubHNwc2VydmVyY29uZmlnX25ldyhlLHQsbik7cmV0dXJuIHRoaXMuX193YmdfcHRyPXI+Pj4wLHpuLnJlZ2lzdGVyKHRoaXMsdGhpcy5fX3diZ19wdHIsdGhpcyksdGhpc319U3ltYm9sLmRpc3Bvc2UmJihFbi5wcm90b3R5cGVbU3ltYm9sLmRpc3Bvc2VdPUVuLnByb3RvdHlwZS5mcmVlKTtjbGFzcyBVbntfX2Rlc3Ryb3lfaW50b19yYXcoKXtjb25zdCBlPXRoaXMuX193YmdfcHRyO3JldHVybiB0aGlzLl9fd2JnX3B0cj0wLERuLnVucmVnaXN0ZXIodGhpcyksZX1mcmVlKCl7Y29uc3QgZT10aGlzLl9fZGVzdHJveV9pbnRvX3JhdygpO3VyLl9fd2JnX3Jlc3BvbnNlY29udGV4dF9mcmVlKGUsMCl9Y29uc3RydWN0b3IoKXtjb25zdCBlPXVyLnJlc3BvbnNlY29udGV4dF9uZXcoKTtyZXR1cm4gdGhpcy5fX3diZ19wdHI9ZT4+PjAsRG4ucmVnaXN0ZXIodGhpcyx0aGlzLl9fd2JnX3B0cix0aGlzKSx0aGlzfXNlbmRfcmVzcG9uc2UoZSl7cmV0dXJuIHVyLnJlc3BvbnNlY29udGV4dF9zZW5kX3Jlc3BvbnNlKHRoaXMuX193YmdfcHRyLGUpfX1TeW1ib2wuZGlzcG9zZSYmKFVuLnByb3RvdHlwZVtTeW1ib2wuZGlzcG9zZV09VW4ucHJvdG90eXBlLmZyZWUpO2NsYXNzIE9ue3N0YXRpYyBfX3dyYXAoZSl7ZT4+Pj0wO2NvbnN0IHQ9T2JqZWN0LmNyZWF0ZShPbi5wcm90b3R5cGUpO3JldHVybiB0Ll9fd2JnX3B0cj1lLENuLnJlZ2lzdGVyKHQsdC5fX3diZ19wdHIsdCksdH1fX2Rlc3Ryb3lfaW50b19yYXcoKXtjb25zdCBlPXRoaXMuX193YmdfcHRyO3JldHVybiB0aGlzLl9fd2JnX3B0cj0wLENuLnVucmVnaXN0ZXIodGhpcyksZX1mcmVlKCl7Y29uc3QgZT10aGlzLl9fZGVzdHJveV9pbnRvX3JhdygpO3VyLl9fd2JnX3RhbmdlbnRpYWxhcmNpbmZvb3V0cHV0d2FzbV9mcmVlKGUsMCl9Z2V0IGFyY19sZW5ndGgoKXtyZXR1cm4gdXIuX193YmdfZ2V0X3RhbmdlbnRpYWxhcmNpbmZvb3V0cHV0d2FzbV9hcmNfbGVuZ3RoKHRoaXMuX193YmdfcHRyKX1nZXQgYXJjX21pZF9wb2ludF94KCl7cmV0dXJuIHVyLl9fd2JnX2dldF90YW5nZW50aWFsYXJjaW5mb291dHB1dHdhc21fYXJjX21pZF9wb2ludF94KHRoaXMuX193YmdfcHRyKX1nZXQgYXJjX21pZF9wb2ludF95KCl7cmV0dXJuIHVyLl9fd2JnX2dldF90YW5nZW50aWFsYXJjaW5mb291dHB1dHdhc21fYXJjX21pZF9wb2ludF95KHRoaXMuX193YmdfcHRyKX1nZXQgY2N3KCl7cmV0dXJuIHVyLl9fd2JnX2dldF90YW5nZW50aWFsYXJjaW5mb291dHB1dHdhc21fY2N3KHRoaXMuX193YmdfcHRyKX1nZXQgY2VudGVyX3goKXtyZXR1cm4gdXIuX193YmdfZ2V0X3RhbmdlbnRpYWxhcmNpbmZvb3V0cHV0d2FzbV9jZW50ZXJfeCh0aGlzLl9fd2JnX3B0cil9Z2V0IGNlbnRlcl95KCl7cmV0dXJuIHVyLl9fd2JnX2dldF90YW5nZW50aWFsYXJjaW5mb291dHB1dHdhc21fY2VudGVyX3kodGhpcy5fX3diZ19wdHIpfWdldCBlbmRfYW5nbGUoKXtyZXR1cm4gdXIuX193YmdfZ2V0X3RhbmdlbnRpYWxhcmNpbmZvb3V0cHV0d2FzbV9lbmRfYW5nbGUodGhpcy5fX3diZ19wdHIpfWdldCByYWRpdXMoKXtyZXR1cm4gdXIuX193YmdfZ2V0X3RhbmdlbnRpYWxhcmNpbmZvb3V0cHV0d2FzbV9yYWRpdXModGhpcy5fX3diZ19wdHIpfWdldCBzdGFydF9hbmdsZSgpe3JldHVybiB1ci5fX3diZ19nZXRfdGFuZ2VudGlhbGFyY2luZm9vdXRwdXR3YXNtX3N0YXJ0X2FuZ2xlKHRoaXMuX193YmdfcHRyKX1zZXQgYXJjX2xlbmd0aChlKXt1ci5fX3diZ19zZXRfdGFuZ2VudGlhbGFyY2luZm9vdXRwdXR3YXNtX2FyY19sZW5ndGgodGhpcy5fX3diZ19wdHIsZSl9c2V0IGFyY19taWRfcG9pbnRfeChlKXt1ci5fX3diZ19zZXRfdGFuZ2VudGlhbGFyY2luZm9vdXRwdXR3YXNtX2FyY19taWRfcG9pbnRfeCh0aGlzLl9fd2JnX3B0cixlKX1zZXQgYXJjX21pZF9wb2ludF95KGUpe3VyLl9fd2JnX3NldF90YW5nZW50aWFsYXJjaW5mb291dHB1dHdhc21fYXJjX21pZF9wb2ludF95KHRoaXMuX193YmdfcHRyLGUpfXNldCBjY3coZSl7dXIuX193Ymdfc2V0X3RhbmdlbnRpYWxhcmNpbmZvb3V0cHV0d2FzbV9jY3codGhpcy5fX3diZ19wdHIsZSl9c2V0IGNlbnRlcl94KGUpe3VyLl9fd2JnX3NldF90YW5nZW50aWFsYXJjaW5mb291dHB1dHdhc21fY2VudGVyX3godGhpcy5fX3diZ19wdHIsZSl9c2V0IGNlbnRlcl95KGUpe3VyLl9fd2JnX3NldF90YW5nZW50aWFsYXJjaW5mb291dHB1dHdhc21fY2VudGVyX3kodGhpcy5fX3diZ19wdHIsZSl9c2V0IGVuZF9hbmdsZShlKXt1ci5fX3diZ19zZXRfdGFuZ2VudGlhbGFyY2luZm9vdXRwdXR3YXNtX2VuZF9hbmdsZSh0aGlzLl9fd2JnX3B0cixlKX1zZXQgcmFkaXVzKGUpe3VyLl9fd2JnX3NldF90YW5nZW50aWFsYXJjaW5mb291dHB1dHdhc21fcmFkaXVzKHRoaXMuX193YmdfcHRyLGUpfXNldCBzdGFydF9hbmdsZShlKXt1ci5fX3diZ19zZXRfdGFuZ2VudGlhbGFyY2luZm9vdXRwdXR3YXNtX3N0YXJ0X2FuZ2xlKHRoaXMuX193YmdfcHRyLGUpfX1TeW1ib2wuZGlzcG9zZSYmKE9uLnByb3RvdHlwZVtTeW1ib2wuZGlzcG9zZV09T24ucHJvdG90eXBlLmZyZWUpO2NsYXNzIE5ue3N0YXRpYyBfX3dyYXAoZSl7ZT4+Pj0wO2NvbnN0IHQ9T2JqZWN0LmNyZWF0ZShObi5wcm90b3R5cGUpO3JldHVybiB0Ll9fd2JnX3B0cj1lLE1uLnJlZ2lzdGVyKHQsdC5fX3diZ19wdHIsdCksdH1fX2Rlc3Ryb3lfaW50b19yYXcoKXtjb25zdCBlPXRoaXMuX193YmdfcHRyO3JldHVybiB0aGlzLl9fd2JnX3B0cj0wLE1uLnVucmVnaXN0ZXIodGhpcyksZX1mcmVlKCl7Y29uc3QgZT10aGlzLl9fZGVzdHJveV9pbnRvX3JhdygpO3VyLl9fd2JnX3dhc21jaXJjbGVwYXJhbXNfZnJlZShlLDApfWdldCBjZW50ZXJfeCgpe3JldHVybiB1ci5fX3diZ19nZXRfd2FzbWNpcmNsZXBhcmFtc19jZW50ZXJfeCh0aGlzLl9fd2JnX3B0cil9Z2V0IGNlbnRlcl95KCl7cmV0dXJuIHVyLl9fd2JnX2dldF93YXNtY2lyY2xlcGFyYW1zX2NlbnRlcl95KHRoaXMuX193YmdfcHRyKX1nZXQgcmFkaXVzKCl7cmV0dXJuIHVyLl9fd2JnX2dldF93YXNtY2lyY2xlcGFyYW1zX3JhZGl1cyh0aGlzLl9fd2JnX3B0cil9c2V0IGNlbnRlcl94KGUpe3VyLl9fd2JnX3NldF93YXNtY2lyY2xlcGFyYW1zX2NlbnRlcl94KHRoaXMuX193YmdfcHRyLGUpfXNldCBjZW50ZXJfeShlKXt1ci5fX3diZ19zZXRfd2FzbWNpcmNsZXBhcmFtc19jZW50ZXJfeSh0aGlzLl9fd2JnX3B0cixlKX1zZXQgcmFkaXVzKGUpe3VyLl9fd2JnX3NldF93YXNtY2lyY2xlcGFyYW1zX3JhZGl1cyh0aGlzLl9fd2JnX3B0cixlKX19ZnVuY3Rpb24gSW4oZSl7Y29uc3QgdD1vcihlLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksbj1fcixyPXVyLnBhcnNlX3dhc20odCxuKTtpZihyWzJdKXRocm93IHNyKHJbMV0pO3JldHVybiBzcihyWzBdKX1mdW5jdGlvbiB2bigpe2NvbnN0IGU9e19fcHJvdG9fXzpudWxsLF9fd2JnX0Vycm9yXzU1NTM4NDgzZGU2ZTNhYmU6ZnVuY3Rpb24oZSx0KXtyZXR1cm4gRXJyb3IoWG4oZSx0KSl9LF9fd2JnX19fd2JpbmRnZW5fYm9vbGVhbl9nZXRfZmUyYTI0ZmRmZGI0MDY0ZjpmdW5jdGlvbihlKXtjb25zdCB0PSJib29sZWFuIj09dHlwZW9mIGU/ZTp2b2lkIDA7cmV0dXJuIG5yKHQpPzE2Nzc3MjE1OnQ/MTowfSxfX3diZ19fX3diaW5kZ2VuX2RlYnVnX3N0cmluZ19kODk2MjcyMDJkMDE1NWI3OmZ1bmN0aW9uKGUsdCl7Y29uc3Qgbj1vcihXbih0KSx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLHI9X3I7S24oKS5zZXRJbnQzMihlKzQsciwhMCksS24oKS5zZXRJbnQzMihlKzAsbiwhMCl9LF9fd2JnX19fd2JpbmRnZW5faXNfZnVuY3Rpb25fMmE5NTQwNjQyM2VhODYyNjpmdW5jdGlvbihlKXtyZXR1cm4iZnVuY3Rpb24iPT10eXBlb2YgZX0sX193YmdfX193YmluZGdlbl9pc19udWxsXzhkOTA1MjRjOWUwYWYxODM6ZnVuY3Rpb24oZSl7cmV0dXJuIG51bGw9PT1lfSxfX3diZ19fX3diaW5kZ2VuX2lzX29iamVjdF81OWEwMDJlNzZiMDU5MzEyOmZ1bmN0aW9uKGUpe3JldHVybiJvYmplY3QiPT10eXBlb2YgZSYmbnVsbCE9PWV9LF9fd2JnX19fd2JpbmRnZW5faXNfdW5kZWZpbmVkXzg3YTNhODM3ZjMzMWZlZjU6ZnVuY3Rpb24oZSl7cmV0dXJuIHZvaWQgMD09PWV9LF9fd2JnX19fd2JpbmRnZW5fc3RyaW5nX2dldF9mMTE2MTM5MDQxNGY5YjU5OmZ1bmN0aW9uKGUsdCl7Y29uc3Qgbj0ic3RyaW5nIj09dHlwZW9mIHQ/dDp2b2lkIDA7dmFyIHI9bnIobik/MDpvcihuLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksaT1fcjtLbigpLnNldEludDMyKGUrNCxpLCEwKSxLbigpLnNldEludDMyKGUrMCxyLCEwKX0sX193YmdfX193YmluZGdlbl90aHJvd181NTQ5NDkyZGFlZGFkMTM5OmZ1bmN0aW9uKGUsdCl7dGhyb3cgbmV3IEVycm9yKFhuKGUsdCkpfSxfX3diZ19fd2JnX2NiX3VucmVmX2ZiZTY5YmIwNzZjMTZiYWQ6ZnVuY3Rpb24oZSl7ZS5fd2JnX2NiX3VucmVmKCl9LF9fd2JnX2J1ZmZlcl8wYTU3Nzg4Y2RmY2UyMWJhOmZ1bmN0aW9uKGUpe3JldHVybiBlLmJ1ZmZlcn0sX193YmdfYnlvYlJlcXVlc3RfYWIwZTU3ZjU1YmY3NzRmMjpmdW5jdGlvbihlKXtjb25zdCB0PWUuYnlvYlJlcXVlc3Q7cmV0dXJuIG5yKHQpPzA6Vm4odCl9LF9fd2JnX2J5dGVMZW5ndGhfOTkzMWRiMDBlNTg2MWJmOTpmdW5jdGlvbihlKXtyZXR1cm4gZS5ieXRlTGVuZ3RofSxfX3diZ19ieXRlT2Zmc2V0XzBhOTg1YTk4ZjhmZmI4ZDc6ZnVuY3Rpb24oZSl7cmV0dXJuIGUuYnl0ZU9mZnNldH0sX193YmdfY2FsbF84ZjVkN2JiMDcwMjgzNTA4OmZ1bmN0aW9uKCl7cmV0dXJuIHRyKChmdW5jdGlvbihlLHQsbil7cmV0dXJuIGUuY2FsbCh0LG4pfSksYXJndW1lbnRzKX0sX193YmdfY2xvc2VfNjJmNmE0ZWFkYzk0NTY1ZjpmdW5jdGlvbigpe3JldHVybiB0cigoZnVuY3Rpb24oZSl7ZS5jbG9zZSgpfSksYXJndW1lbnRzKX0sX193YmdfY2xvc2VfODcxZTUxNmEyNzNkMTVmODpmdW5jdGlvbihlKXtyZXR1cm4gZS5jbG9zZSgpfSxfX3diZ19jbG9zZV9mMjg3MDU4NzE2MDg4YTUwOmZ1bmN0aW9uKCl7cmV0dXJuIHRyKChmdW5jdGlvbihlKXtlLmNsb3NlKCl9KSxhcmd1bWVudHMpfSxfX3diZ19kb25lXzE5ZjkyY2IxZjg3MzhhYmE6ZnVuY3Rpb24oZSl7cmV0dXJuIGUuZG9uZX0sX193YmdfZW5xdWV1ZV9lZTA1OTNjZWE5YmU5M2JkOmZ1bmN0aW9uKCl7cmV0dXJuIHRyKChmdW5jdGlvbihlLHQpe2UuZW5xdWV1ZSh0KX0pLGFyZ3VtZW50cyl9LF9fd2JnX2Vycm9yX2E2ZmEyMDJiNThhYTFjZDM6ZnVuY3Rpb24oZSx0KXtsZXQgbixyO3RyeXtuPWUscj10LGNvbnNvbGUuZXJyb3IoWG4oZSx0KSl9ZmluYWxseXt1ci5fX3diaW5kZ2VuX2ZyZWUobixyLDEpfX0sX193YmdfZXJyb3JfZGU2Yjg2ZTU5ODUwNTI0NjpmdW5jdGlvbihlKXtjb25zb2xlLmVycm9yKGUpfSxfX3diZ19leGlzdHNfZDBkYWJhMzJiNDBhY2RlMzpmdW5jdGlvbigpe3JldHVybiB0cigoZnVuY3Rpb24oZSx0LG4pe2xldCByLGk7dHJ5e3I9dCxpPW47cmV0dXJuIGUuZXhpc3RzKFhuKHQsbikpfWZpbmFsbHl7dXIuX193YmluZGdlbl9mcmVlKHIsaSwxKX19KSxhcmd1bWVudHMpfSxfX3diZ19maXJlTW9kZWxpbmdDb21tYW5kRnJvbVdhc21fYjA0ZjY4ZjM2NDE5NjVmMzpmdW5jdGlvbigpe3JldHVybiB0cigoZnVuY3Rpb24oZSx0LG4scixpLG8scyxhLGMpe2xldCBsLGYsdSxfLGcsaCxiLGQ7dHJ5e2w9dCxmPW4sdT1yLF89aSxnPW8saD1zLGI9YSxkPWMsZS5maXJlTW9kZWxpbmdDb21tYW5kRnJvbVdhc20oWG4odCxuKSxYbihyLGkpLFhuKG8scyksWG4oYSxjKSl9ZmluYWxseXt1ci5fX3diaW5kZ2VuX2ZyZWUobCxmLDEpLHVyLl9fd2JpbmRnZW5fZnJlZSh1LF8sMSksdXIuX193YmluZGdlbl9mcmVlKGcsaCwxKSx1ci5fX3diaW5kZ2VuX2ZyZWUoYixkLDEpfX0pLGFyZ3VtZW50cyl9LF9fd2JnX2dldEFsbEZpbGVzXzM4YjQ5OTYzNjJhODU2NWI6ZnVuY3Rpb24oKXtyZXR1cm4gdHIoKGZ1bmN0aW9uKGUsdCxuKXtsZXQgcixpO3RyeXtyPXQsaT1uO3JldHVybiBlLmdldEFsbEZpbGVzKFhuKHQsbikpfWZpbmFsbHl7dXIuX193YmluZGdlbl9mcmVlKHIsaSwxKX19KSxhcmd1bWVudHMpfSxfX3diZ19nZXRSYW5kb21WYWx1ZXNfM2Y0NGI3MDAzOTUwNjJlNTpmdW5jdGlvbigpe3JldHVybiB0cigoZnVuY3Rpb24oZSx0KXtnbG9iYWxUaGlzLmNyeXB0by5nZXRSYW5kb21WYWx1ZXMocW4oZSx0KSl9KSxhcmd1bWVudHMpfSxfX3diZ19nZXRSYW5kb21WYWx1ZXNfOGFhMzExMmM2NjE1ZWVmNjpmdW5jdGlvbigpe3JldHVybiB0cigoZnVuY3Rpb24oZSx0KXtnbG9iYWxUaGlzLmNyeXB0by5nZXRSYW5kb21WYWx1ZXMocW4oZSx0KSl9KSxhcmd1bWVudHMpfSxfX3diZ19nZXRXcml0ZXJfN2M5NTMxNDlhZjI3M2MyOTpmdW5jdGlvbigpe3JldHVybiB0cigoZnVuY3Rpb24oZSl7cmV0dXJuIGUuZ2V0V3JpdGVyKCl9KSxhcmd1bWVudHMpfSxfX3diZ19nZXRfZmY1ZjFmYjIyMDIzMzQ3NzpmdW5jdGlvbigpe3JldHVybiB0cigoZnVuY3Rpb24oZSx0KXtyZXR1cm4gUmVmbGVjdC5nZXQoZSx0KX0pLGFyZ3VtZW50cyl9LF9fd2JnX2luc3RhbmNlb2ZfVWludDhBcnJheV9jZTI0ZDU4YTVmNGJkY2MzOmZ1bmN0aW9uKGUpe2xldCB0O3RyeXt0PWUgaW5zdGFuY2VvZiBVaW50OEFycmF5fWNhdGNoKGUpe3Q9ITF9cmV0dXJuIHR9LF9fd2JnX2luc3RhbmNlb2ZfV2luZG93XzJmYThkOWMyZDViNjEwNGE6ZnVuY3Rpb24oZSl7bGV0IHQ7dHJ5e3Q9ZSBpbnN0YW5jZW9mIFdpbmRvd31jYXRjaChlKXt0PSExfXJldHVybiB0fSxfX3diZ19pbnN0YW5jZW9mX1dvcmtlckdsb2JhbFNjb3BlX2E0MzA3Yzg1ZjczZDgzYzM6ZnVuY3Rpb24oZSl7bGV0IHQ7dHJ5e3Q9ZSBpbnN0YW5jZW9mIFdvcmtlckdsb2JhbFNjb3BlfWNhdGNoKGUpe3Q9ITF9cmV0dXJuIHR9LF9fd2JnX2xlbmd0aF9lNmUxNjMzZmJlYTZjZmE5OmZ1bmN0aW9uKGUpe3JldHVybiBlLmxlbmd0aH0sX193YmdfbG9nXzZhNzViNzFkNjMxNmU5MzU6ZnVuY3Rpb24oZSl7Y29uc29sZS5sb2coZSl9LF9fd2JnX25ld18xZDk2Njc4YWFhY2NhMzJlOmZ1bmN0aW9uKGUpe3JldHVybiBuZXcgVWludDhBcnJheShlKX0sX193YmdfbmV3XzIyN2Q3YzA1NDE0ZWI4NjE6ZnVuY3Rpb24oKXtyZXR1cm4gbmV3IEVycm9yfSxfX3diZ19uZXdfNGE4NDNmZTJlZTQwODJhOTpmdW5jdGlvbihlLHQpe3JldHVybiBuZXcgRXJyb3IoWG4oZSx0KSl9LF9fd2JnX25ld19mcm9tX3NsaWNlXzBiYzU4ZTM2ZjgyYTFiNTA6ZnVuY3Rpb24oZSx0KXtyZXR1cm4gbmV3IFVpbnQ4QXJyYXkocW4oZSx0KSl9LF9fd2JnX25ld190eXBlZF8yNWRkYTIzODhkN2U1ZTlmOmZ1bmN0aW9uKGUsdCl7dHJ5e3ZhciBuPXthOmUsYjp0fTtjb25zdCByPW5ldyBQcm9taXNlKCgoZSx0KT0+e2NvbnN0IHI9bi5hO24uYT0wO3RyeXtyZXR1cm4gZnVuY3Rpb24oZSx0LG4scil7dXIud2FzbV9iaW5kZ2VuX19jb252ZXJ0X19jbG9zdXJlc19fX19faW52b2tlX19oMDNlMDFmZGQ3NGFiY2RhYihlLHQsbixyKX0ocixuLmIsZSx0KX1maW5hbGx5e24uYT1yfX0pKTtyZXR1cm4gcn1maW5hbGx5e24uYT0wfX0sX193YmdfbmV3X3dpdGhfYnl0ZV9vZmZzZXRfYW5kX2xlbmd0aF9hYjFlMTAwMmQ3YTY5NGU0OmZ1bmN0aW9uKGUsdCxuKXtyZXR1cm4gbmV3IFVpbnQ4QXJyYXkoZSx0Pj4+MCxuPj4+MCl9LF9fd2JnX25leHRfMWI3YjVjMDA3OTY2NTYwZjpmdW5jdGlvbigpe3JldHVybiB0cigoZnVuY3Rpb24oZSl7cmV0dXJuIGUubmV4dCgpfSksYXJndW1lbnRzKX0sX193Ymdfbm93X2E5YWY0NTU0ZWRiN2FjNzg6ZnVuY3Rpb24oZSl7cmV0dXJuIGUubm93KCl9LF9fd2JnX25vd19lN2M2Nzk1YTdmODFlMTBmOmZ1bmN0aW9uKGUpe3JldHVybiBlLm5vdygpfSxfX3diZ19vbk9wZXJhdGlvbl9hNjIyMDQ2Y2NjMzRkYzUxOmZ1bmN0aW9uKGUsdCl7ZS5vbk9wZXJhdGlvbih0KX0sX193YmdfcGFyc2VfZTU3MDNmZDUyMjExZTY4ODpmdW5jdGlvbigpe3JldHVybiB0cigoZnVuY3Rpb24oZSx0KXtyZXR1cm4gSlNPTi5wYXJzZShYbihlLHQpKX0pLGFyZ3VtZW50cyl9LF9fd2JnX3BlcmZvcm1hbmNlXzNmY2Y2ZTMyYTdlMWVkMGE6ZnVuY3Rpb24oZSl7cmV0dXJuIGUucGVyZm9ybWFuY2V9LF9fd2JnX3Byb3RvdHlwZXNldGNhbGxfMzg3NWQ1NGQxMmVmMmVlYzpmdW5jdGlvbihlLHQsbil7VWludDhBcnJheS5wcm90b3R5cGUuc2V0LmNhbGwocW4oZSx0KSxuKX0sX193YmdfcXVldWVNaWNyb3Rhc2tfODg2ODM2NTExNGZlMjNiNTpmdW5jdGlvbihlKXtxdWV1ZU1pY3JvdGFzayhlKX0sX193YmdfcXVldWVNaWNyb3Rhc2tfY2ZjNWEwZTYyZjllYmRiZTpmdW5jdGlvbihlKXtyZXR1cm4gZS5xdWV1ZU1pY3JvdGFza30sX193YmdfcmVhZEZpbGVfYzkzNTQzNDhjOGQ1YjcxYjpmdW5jdGlvbigpe3JldHVybiB0cigoZnVuY3Rpb24oZSx0LG4pe2xldCByLGk7dHJ5e3I9dCxpPW47cmV0dXJuIGUucmVhZEZpbGUoWG4odCxuKSl9ZmluYWxseXt1ci5fX3diaW5kZ2VuX2ZyZWUocixpLDEpfX0pLGFyZ3VtZW50cyl9LF9fd2JnX3JlYWR5XzU4NTZkYjZmMDBlM2UyMGE6ZnVuY3Rpb24oZSl7cmV0dXJuIGUucmVhZHl9LF9fd2JnX3JlbGVhc2VMb2NrXzk1YmJjN2NmN2I4Nzk3N2Q6ZnVuY3Rpb24oZSl7ZS5yZWxlYXNlTG9jaygpfSxfX3diZ19yZXNvbHZlX2Q4MDU5YmMxMTNlMjE1YmY6ZnVuY3Rpb24oZSl7cmV0dXJuIFByb21pc2UucmVzb2x2ZShlKX0sX193YmdfcmVzcG9uZF8xZWMyOTM5NWVkYmU3ZmNlOmZ1bmN0aW9uKCl7cmV0dXJuIHRyKChmdW5jdGlvbihlLHQpe2UucmVzcG9uZCh0Pj4+MCl9KSxhcmd1bWVudHMpfSxfX3diZ19zZW5kTW9kZWxpbmdDb21tYW5kRnJvbVdhc21fOWEwYmY0ZTViMzNjMDRkZjpmdW5jdGlvbigpe3JldHVybiB0cigoZnVuY3Rpb24oZSx0LG4scixpLG8scyxhLGMpe2xldCBsLGYsdSxfLGcsaCxiLGQ7dHJ5e2w9dCxmPW4sdT1yLF89aSxnPW8saD1zLGI9YSxkPWM7cmV0dXJuIGUuc2VuZE1vZGVsaW5nQ29tbWFuZEZyb21XYXNtKFhuKHQsbiksWG4ocixpKSxYbihvLHMpLFhuKGEsYykpfWZpbmFsbHl7dXIuX193YmluZGdlbl9mcmVlKGwsZiwxKSx1ci5fX3diaW5kZ2VuX2ZyZWUodSxfLDEpLHVyLl9fd2JpbmRnZW5fZnJlZShnLGgsMSksdXIuX193YmluZGdlbl9mcmVlKGIsZCwxKX19KSxhcmd1bWVudHMpfSxfX3diZ19zZXRUaW1lb3V0XzQ2NmQ1MGYzNTEyMjQ1Y2I6ZnVuY3Rpb24oKXtyZXR1cm4gdHIoKGZ1bmN0aW9uKGUsdCxuKXtyZXR1cm4gZS5zZXRUaW1lb3V0KHQsbil9KSxhcmd1bWVudHMpfSxfX3diZ19zZXRUaW1lb3V0X2MxYzlhMThiNjM0M2ViZDM6ZnVuY3Rpb24oKXtyZXR1cm4gdHIoKGZ1bmN0aW9uKGUsdCxuKXtyZXR1cm4gZS5zZXRUaW1lb3V0KHQsbil9KSxhcmd1bWVudHMpfSxfX3diZ19zZXRfMjk1YmFkM2I1ZWFkNGU5OTpmdW5jdGlvbihlLHQsbil7ZS5zZXQocW4odCxuKSl9LF9fd2JnX3N0YWNrXzNiMGQ5NzRiYmYzMWU0NGY6ZnVuY3Rpb24oZSx0KXtjb25zdCBuPW9yKHQuc3RhY2ssdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxyPV9yO0tuKCkuc2V0SW50MzIoZSs0LHIsITApLEtuKCkuc2V0SW50MzIoZSswLG4sITApfSxfX3diZ19zdGFydE5ld1Nlc3Npb25fZmJjNDE1NmQ0MGEzMzhmYzpmdW5jdGlvbigpe3JldHVybiB0cigoZnVuY3Rpb24oZSl7cmV0dXJuIGUuc3RhcnROZXdTZXNzaW9uKCl9KSxhcmd1bWVudHMpfSxfX3diZ19zdGF0aWNfYWNjZXNzb3JfR0xPQkFMXzhkZmI3ZjVlMjZlYmU1MjM6ZnVuY3Rpb24oKXtjb25zdCBlPSJ1bmRlZmluZWQiPT10eXBlb2YgZ2xvYmFsP251bGw6Z2xvYmFsO3JldHVybiBucihlKT8wOlZuKGUpfSxfX3diZ19zdGF0aWNfYWNjZXNzb3JfR0xPQkFMX1RISVNfOTQxMTU0ZWZjODM5NWNkZDpmdW5jdGlvbigpe2NvbnN0IGU9InVuZGVmaW5lZCI9PXR5cGVvZiBnbG9iYWxUaGlzP251bGw6Z2xvYmFsVGhpcztyZXR1cm4gbnIoZSk/MDpWbihlKX0sX193Ymdfc3RhdGljX2FjY2Vzc29yX1NFTEZfNThkYWM5YWY4MjJmNTYxZjpmdW5jdGlvbigpe2NvbnN0IGU9InVuZGVmaW5lZCI9PXR5cGVvZiBzZWxmP251bGw6c2VsZjtyZXR1cm4gbnIoZSk/MDpWbihlKX0sX193Ymdfc3RhdGljX2FjY2Vzc29yX1dJTkRPV19lZTY0ZjBiM2Q4MzU0YzBiOmZ1bmN0aW9uKCl7Y29uc3QgZT0idW5kZWZpbmVkIj09dHlwZW9mIHdpbmRvdz9udWxsOndpbmRvdztyZXR1cm4gbnIoZSk/MDpWbihlKX0sX193Ymdfc3RyaW5naWZ5X2I2N2UyYzhjNjBiOTNmNjk6ZnVuY3Rpb24oKXtyZXR1cm4gdHIoKGZ1bmN0aW9uKGUpe3JldHVybiBKU09OLnN0cmluZ2lmeShlKX0pLGFyZ3VtZW50cyl9LF9fd2JnX3RoZW5fMDE1MDM1MmU0YWQyMDM0NDpmdW5jdGlvbihlLHQsbil7cmV0dXJuIGUudGhlbih0LG4pfSxfX3diZ190aGVuXzUxNjA0ODZjNjdkZGI5OGE6ZnVuY3Rpb24oZSx0KXtyZXR1cm4gZS50aGVuKHQpfSxfX3diZ190b1N0cmluZ181NTNiNWY2ZTk1ZTNlNDFiOmZ1bmN0aW9uKGUpe3JldHVybiBlLnRvU3RyaW5nKCl9LF9fd2JnX3RvU3RyaW5nXzllNzM1M2E3N2NiNDE1YTI6ZnVuY3Rpb24oZSl7cmV0dXJuIGUudG9TdHJpbmcoKX0sX193YmdfdmFsdWVfZDViMjQ4Y2U4NDE5YmQxYjpmdW5jdGlvbihlKXtyZXR1cm4gZS52YWx1ZX0sX193Ymdfdmlld18zOGE5MzA4NDRjOTY0MTAzOmZ1bmN0aW9uKGUpe2NvbnN0IHQ9ZS52aWV3O3JldHVybiBucih0KT8wOlZuKHQpfSxfX3diZ193YXJuXzg2ZWYwM2RiOGNmYjRkZDQ6ZnVuY3Rpb24oZSl7Y29uc29sZS53YXJuKGUpfSxfX3diZ193cml0ZV9mZjNhM2RlNDkwMmFhOGJmOmZ1bmN0aW9uKGUsdCl7cmV0dXJuIGUud3JpdGUodCl9LF9fd2JpbmRnZW5fY2FzdF8wMDAwMDAwMDAwMDAwMDAxOmZ1bmN0aW9uKGUsdCl7cmV0dXJuIHJyKGUsdCwkbil9LF9fd2JpbmRnZW5fY2FzdF8wMDAwMDAwMDAwMDAwMDAyOmZ1bmN0aW9uKGUsdCl7cmV0dXJuIHJyKGUsdCxMbil9LF9fd2JpbmRnZW5fY2FzdF8wMDAwMDAwMDAwMDAwMDAzOmZ1bmN0aW9uKGUsdCl7cmV0dXJuIHJyKGUsdCxUbil9LF9fd2JpbmRnZW5fY2FzdF8wMDAwMDAwMDAwMDAwMDA0OmZ1bmN0aW9uKGUsdCl7cmV0dXJuIFhuKGUsdCl9LF9fd2JpbmRnZW5faW5pdF9leHRlcm5yZWZfdGFibGU6ZnVuY3Rpb24oKXtjb25zdCBlPXVyLl9fd2JpbmRnZW5fZXh0ZXJucmVmcyx0PWUuZ3Jvdyg0KTtlLnNldCgwLHZvaWQgMCksZS5zZXQodCswLHZvaWQgMCksZS5zZXQodCsxLG51bGwpLGUuc2V0KHQrMiwhMCksZS5zZXQodCszLCExKX19O3JldHVybntfX3Byb3RvX186bnVsbCwiLi9rY2xfd2FzbV9saWJfYmcuanMiOmV9fWZ1bmN0aW9uIFRuKGUsdCl7dXIud2FzbV9iaW5kZ2VuX19jb252ZXJ0X19jbG9zdXJlc19fX19faW52b2tlX19oN2ZiN2E5MzYyZDE0Zjg5OChlLHQpfWZ1bmN0aW9uICRuKGUsdCxuKXtjb25zdCByPXVyLndhc21fYmluZGdlbl9fY29udmVydF9fY2xvc3VyZXNfX19fX2ludm9rZV9faGEwODQ3Y2Y2OTcxMzMxYjUoZSx0LG4pO2lmKHJbMV0pdGhyb3cgc3IoclswXSl9ZnVuY3Rpb24gTG4oZSx0LG4pe2NvbnN0IHI9dXIud2FzbV9iaW5kZ2VuX19jb252ZXJ0X19jbG9zdXJlc19fX19faW52b2tlX19oZjM4ZDU2N2M2ZTZkNjgyNyhlLHQsbik7aWYoclsxXSl0aHJvdyBzcihyWzBdKX1TeW1ib2wuZGlzcG9zZSYmKE5uLnByb3RvdHlwZVtTeW1ib2wuZGlzcG9zZV09Tm4ucHJvdG90eXBlLmZyZWUpO2NvbnN0IEFuPVsiYnl0ZXMiXSxSbj0idW5kZWZpbmVkIj09dHlwZW9mIEZpbmFsaXphdGlvblJlZ2lzdHJ5P3tyZWdpc3RlcjooKT0+e30sdW5yZWdpc3RlcjooKT0+e319Om5ldyBGaW5hbGl6YXRpb25SZWdpc3RyeSgoZT0+dXIuX193YmdfY29udGV4dF9mcmVlKGU+Pj4wLDEpKSksam49InVuZGVmaW5lZCI9PXR5cGVvZiBGaW5hbGl6YXRpb25SZWdpc3RyeT97cmVnaXN0ZXI6KCk9Pnt9LHVucmVnaXN0ZXI6KCk9Pnt9fTpuZXcgRmluYWxpemF0aW9uUmVnaXN0cnkoKGU9PnVyLl9fd2JnX2ludG91bmRlcmx5aW5nYnl0ZXNvdXJjZV9mcmVlKGU+Pj4wLDEpKSksRm49InVuZGVmaW5lZCI9PXR5cGVvZiBGaW5hbGl6YXRpb25SZWdpc3RyeT97cmVnaXN0ZXI6KCk9Pnt9LHVucmVnaXN0ZXI6KCk9Pnt9fTpuZXcgRmluYWxpemF0aW9uUmVnaXN0cnkoKGU9PnVyLl9fd2JnX2ludG91bmRlcmx5aW5nc2lua19mcmVlKGU+Pj4wLDEpKSksa249InVuZGVmaW5lZCI9PXR5cGVvZiBGaW5hbGl6YXRpb25SZWdpc3RyeT97cmVnaXN0ZXI6KCk9Pnt9LHVucmVnaXN0ZXI6KCk9Pnt9fTpuZXcgRmluYWxpemF0aW9uUmVnaXN0cnkoKGU9PnVyLl9fd2JnX2ludG91bmRlcmx5aW5nc291cmNlX2ZyZWUoZT4+PjAsMSkpKSx6bj0idW5kZWZpbmVkIj09dHlwZW9mIEZpbmFsaXphdGlvblJlZ2lzdHJ5P3tyZWdpc3RlcjooKT0+e30sdW5yZWdpc3RlcjooKT0+e319Om5ldyBGaW5hbGl6YXRpb25SZWdpc3RyeSgoZT0+dXIuX193YmdfbHNwc2VydmVyY29uZmlnX2ZyZWUoZT4+PjAsMSkpKSxEbj0idW5kZWZpbmVkIj09dHlwZW9mIEZpbmFsaXphdGlvblJlZ2lzdHJ5P3tyZWdpc3RlcjooKT0+e30sdW5yZWdpc3RlcjooKT0+e319Om5ldyBGaW5hbGl6YXRpb25SZWdpc3RyeSgoZT0+dXIuX193YmdfcmVzcG9uc2Vjb250ZXh0X2ZyZWUoZT4+PjAsMSkpKSxDbj0idW5kZWZpbmVkIj09dHlwZW9mIEZpbmFsaXphdGlvblJlZ2lzdHJ5P3tyZWdpc3RlcjooKT0+e30sdW5yZWdpc3RlcjooKT0+e319Om5ldyBGaW5hbGl6YXRpb25SZWdpc3RyeSgoZT0+dXIuX193YmdfdGFuZ2VudGlhbGFyY2luZm9vdXRwdXR3YXNtX2ZyZWUoZT4+PjAsMSkpKSxNbj0idW5kZWZpbmVkIj09dHlwZW9mIEZpbmFsaXphdGlvblJlZ2lzdHJ5P3tyZWdpc3RlcjooKT0+e30sdW5yZWdpc3RlcjooKT0+e319Om5ldyBGaW5hbGl6YXRpb25SZWdpc3RyeSgoZT0+dXIuX193Ymdfd2FzbWNpcmNsZXBhcmFtc19mcmVlKGU+Pj4wLDEpKSk7ZnVuY3Rpb24gVm4oZSl7Y29uc3QgdD11ci5fX2V4dGVybnJlZl90YWJsZV9hbGxvYygpO3JldHVybiB1ci5fX3diaW5kZ2VuX2V4dGVybnJlZnMuc2V0KHQsZSksdH1mdW5jdGlvbiBQbihlLHQpe2lmKCEoZSBpbnN0YW5jZW9mIHQpKXRocm93IG5ldyBFcnJvcihgZXhwZWN0ZWQgaW5zdGFuY2Ugb2YgJHt0Lm5hbWV9YCl9Y29uc3QgSm49InVuZGVmaW5lZCI9PXR5cGVvZiBGaW5hbGl6YXRpb25SZWdpc3RyeT97cmVnaXN0ZXI6KCk9Pnt9LHVucmVnaXN0ZXI6KCk9Pnt9fTpuZXcgRmluYWxpemF0aW9uUmVnaXN0cnkoKGU9PnVyLl9fd2JpbmRnZW5fZGVzdHJveV9jbG9zdXJlKGUuYSxlLmIpKSk7ZnVuY3Rpb24gV24oZSl7Y29uc3QgdD10eXBlb2YgZTtpZigibnVtYmVyIj09dHx8ImJvb2xlYW4iPT10fHxudWxsPT1lKXJldHVybmAke2V9YDtpZigic3RyaW5nIj09dClyZXR1cm5gIiR7ZX0iYDtpZigic3ltYm9sIj09dCl7Y29uc3QgdD1lLmRlc2NyaXB0aW9uO3JldHVybiBudWxsPT10PyJTeW1ib2wiOmBTeW1ib2woJHt0fSlgfWlmKCJmdW5jdGlvbiI9PXQpe2NvbnN0IHQ9ZS5uYW1lO3JldHVybiJzdHJpbmciPT10eXBlb2YgdCYmdC5sZW5ndGg+MD9gRnVuY3Rpb24oJHt0fSlgOiJGdW5jdGlvbiJ9aWYoQXJyYXkuaXNBcnJheShlKSl7Y29uc3QgdD1lLmxlbmd0aDtsZXQgbj0iWyI7dD4wJiYobis9V24oZVswXSkpO2ZvcihsZXQgcj0xO3I8dDtyKyspbis9IiwgIitXbihlW3JdKTtyZXR1cm4gbis9Il0iLG59Y29uc3Qgbj0vXFtvYmplY3QgKFteXF1dKylcXS8uZXhlYyh0b1N0cmluZy5jYWxsKGUpKTtsZXQgcjtpZighKG4mJm4ubGVuZ3RoPjEpKXJldHVybiB0b1N0cmluZy5jYWxsKGUpO2lmKHI9blsxXSwiT2JqZWN0Ij09cil0cnl7cmV0dXJuIk9iamVjdCgiK0pTT04uc3RyaW5naWZ5KGUpKyIpIn1jYXRjaChlKXtyZXR1cm4iT2JqZWN0In1yZXR1cm4gZSBpbnN0YW5jZW9mIEVycm9yP2Ake2UubmFtZX06ICR7ZS5tZXNzYWdlfVxuJHtlLnN0YWNrfWA6cn1mdW5jdGlvbiBZbihlLHQpe2U+Pj49MDtjb25zdCBuPUtuKCkscj1bXTtmb3IobGV0IGk9ZTtpPGUrNCp0O2krPTQpci5wdXNoKHVyLl9fd2JpbmRnZW5fZXh0ZXJucmVmcy5nZXQobi5nZXRVaW50MzIoaSwhMCkpKTtyZXR1cm4gdXIuX19leHRlcm5yZWZfZHJvcF9zbGljZShlLHQpLHJ9ZnVuY3Rpb24gcW4oZSx0KXtyZXR1cm4gZT4+Pj0wLGVyKCkuc3ViYXJyYXkoZS8xLGUvMSt0KX1sZXQgSG49bnVsbDtmdW5jdGlvbiBLbigpe3JldHVybihudWxsPT09SG58fCEwPT09SG4uYnVmZmVyLmRldGFjaGVkfHx2b2lkIDA9PT1Ibi5idWZmZXIuZGV0YWNoZWQmJkhuLmJ1ZmZlciE9PXVyLm1lbW9yeS5idWZmZXIpJiYoSG49bmV3IERhdGFWaWV3KHVyLm1lbW9yeS5idWZmZXIpKSxIbn1sZXQgWm49bnVsbDtmdW5jdGlvbiBHbigpe3JldHVybiBudWxsIT09Wm4mJjAhPT1abi5ieXRlTGVuZ3RofHwoWm49bmV3IEZsb2F0NjRBcnJheSh1ci5tZW1vcnkuYnVmZmVyKSksWm59ZnVuY3Rpb24gWG4oZSx0KXtyZXR1cm4gZnVuY3Rpb24oZSx0KXtscis9dCxscj49Y3ImJihhcj1uZXcgVGV4dERlY29kZXIoInV0Zi04Iix7aWdub3JlQk9NOiEwLGZhdGFsOiEwfSksYXIuZGVjb2RlKCksbHI9dCk7cmV0dXJuIGFyLmRlY29kZShlcigpLnN1YmFycmF5KGUsZSt0KSl9KGU+Pj49MCx0KX1sZXQgUW49bnVsbDtmdW5jdGlvbiBlcigpe3JldHVybiBudWxsIT09UW4mJjAhPT1Rbi5ieXRlTGVuZ3RofHwoUW49bmV3IFVpbnQ4QXJyYXkodXIubWVtb3J5LmJ1ZmZlcikpLFFufWZ1bmN0aW9uIHRyKGUsdCl7dHJ5e3JldHVybiBlLmFwcGx5KHRoaXMsdCl9Y2F0Y2goZSl7Y29uc3QgdD1WbihlKTt1ci5fX3diaW5kZ2VuX2V4bl9zdG9yZSh0KX19ZnVuY3Rpb24gbnIoZSl7cmV0dXJuIG51bGw9PWV9ZnVuY3Rpb24gcnIoZSx0LG4pe2NvbnN0IHI9e2E6ZSxiOnQsY250OjF9LGk9KC4uLmUpPT57ci5jbnQrKztjb25zdCB0PXIuYTtyLmE9MDt0cnl7cmV0dXJuIG4odCxyLmIsLi4uZSl9ZmluYWxseXtyLmE9dCxpLl93YmdfY2JfdW5yZWYoKX19O3JldHVybiBpLl93YmdfY2JfdW5yZWY9KCk9PnswPT0tLXIuY250JiYodXIuX193YmluZGdlbl9kZXN0cm95X2Nsb3N1cmUoci5hLHIuYiksci5hPTAsSm4udW5yZWdpc3RlcihyKSl9LEpuLnJlZ2lzdGVyKGkscixyKSxpfWZ1bmN0aW9uIGlyKGUsdCl7Y29uc3Qgbj10KDgqZS5sZW5ndGgsOCk+Pj4wO3JldHVybiBHbigpLnNldChlLG4vOCksX3I9ZS5sZW5ndGgsbn1mdW5jdGlvbiBvcihlLHQsbil7aWYodm9pZCAwPT09bil7Y29uc3Qgbj1mci5lbmNvZGUoZSkscj10KG4ubGVuZ3RoLDEpPj4+MDtyZXR1cm4gZXIoKS5zdWJhcnJheShyLHIrbi5sZW5ndGgpLnNldChuKSxfcj1uLmxlbmd0aCxyfWxldCByPWUubGVuZ3RoLGk9dChyLDEpPj4+MDtjb25zdCBvPWVyKCk7bGV0IHM9MDtmb3IoO3M8cjtzKyspe2NvbnN0IHQ9ZS5jaGFyQ29kZUF0KHMpO2lmKHQ+MTI3KWJyZWFrO29baStzXT10fWlmKHMhPT1yKXswIT09cyYmKGU9ZS5zbGljZShzKSksaT1uKGkscixyPXMrMyplLmxlbmd0aCwxKT4+PjA7Y29uc3QgdD1lcigpLnN1YmFycmF5KGkrcyxpK3IpO3MrPWZyLmVuY29kZUludG8oZSx0KS53cml0dGVuLGk9bihpLHIscywxKT4+PjB9cmV0dXJuIF9yPXMsaX1mdW5jdGlvbiBzcihlKXtjb25zdCB0PXVyLl9fd2JpbmRnZW5fZXh0ZXJucmVmcy5nZXQoZSk7cmV0dXJuIHVyLl9fZXh0ZXJucmVmX3RhYmxlX2RlYWxsb2MoZSksdH1sZXQgYXI9bmV3IFRleHREZWNvZGVyKCJ1dGYtOCIse2lnbm9yZUJPTTohMCxmYXRhbDohMH0pO2FyLmRlY29kZSgpO2NvbnN0IGNyPTIxNDY0MzUwNzI7bGV0IGxyPTA7Y29uc3QgZnI9bmV3IFRleHRFbmNvZGVyOyJlbmNvZGVJbnRvImluIGZyfHwoZnIuZW5jb2RlSW50bz1mdW5jdGlvbihlLHQpe2NvbnN0IG49ZnIuZW5jb2RlKGUpO3JldHVybiB0LnNldChuKSx7cmVhZDplLmxlbmd0aCx3cml0dGVuOm4ubGVuZ3RofX0pO2xldCB1cixfcj0wO2Z1bmN0aW9uIGdyKGUsdCl7cmV0dXJuIHVyPWUuZXhwb3J0cyxIbj1udWxsLFpuPW51bGwsUW49bnVsbCx1ci5fX3diaW5kZ2VuX3N0YXJ0KCksdXJ9YXN5bmMgZnVuY3Rpb24gaHIoZSl7aWYodm9pZCAwIT09dXIpcmV0dXJuIHVyO3ZvaWQgMCE9PWUmJihPYmplY3QuZ2V0UHJvdG90eXBlT2YoZSk9PT1PYmplY3QucHJvdG90eXBlPyh7bW9kdWxlX29yX3BhdGg6ZX09ZSk6Y29uc29sZS53YXJuKCJ1c2luZyBkZXByZWNhdGVkIHBhcmFtZXRlcnMgZm9yIHRoZSBpbml0aWFsaXphdGlvbiBmdW5jdGlvbjsgcGFzcyBhIHNpbmdsZSBvYmplY3QgaW5zdGVhZCIpKSx2b2lkIDA9PT1lJiYoZT1uZXcgVVJMKCJrY2xfd2FzbV9saWJfYmcud2FzbSIsZG9jdW1lbnQuY3VycmVudFNjcmlwdCYmIlNDUklQVCI9PT1kb2N1bWVudC5jdXJyZW50U2NyaXB0LnRhZ05hbWUudG9VcHBlckNhc2UoKSYmZG9jdW1lbnQuY3VycmVudFNjcmlwdC5zcmN8fG5ldyBVUkwoIndvcmtlci13ZWJydGMuanMiLGRvY3VtZW50LmJhc2VVUkkpLmhyZWYpKTtjb25zdCB0PXZuKCk7KCJzdHJpbmciPT10eXBlb2YgZXx8ImZ1bmN0aW9uIj09dHlwZW9mIFJlcXVlc3QmJmUgaW5zdGFuY2VvZiBSZXF1ZXN0fHwiZnVuY3Rpb24iPT10eXBlb2YgVVJMJiZlIGluc3RhbmNlb2YgVVJMKSYmKGU9ZmV0Y2goZSkpO2NvbnN0e2luc3RhbmNlOm4sbW9kdWxlOnJ9PWF3YWl0IGFzeW5jIGZ1bmN0aW9uKGUsdCl7aWYoImZ1bmN0aW9uIj09dHlwZW9mIFJlc3BvbnNlJiZlIGluc3RhbmNlb2YgUmVzcG9uc2Upe2lmKCJmdW5jdGlvbiI9PXR5cGVvZiBXZWJBc3NlbWJseS5pbnN0YW50aWF0ZVN0cmVhbWluZyl0cnl7cmV0dXJuIGF3YWl0IFdlYkFzc2VtYmx5Lmluc3RhbnRpYXRlU3RyZWFtaW5nKGUsdCl9Y2F0Y2godCl7aWYoIWUub2t8fCFmdW5jdGlvbihlKXtzd2l0Y2goZSl7Y2FzZSJiYXNpYyI6Y2FzZSJjb3JzIjpjYXNlImRlZmF1bHQiOnJldHVybiEwfXJldHVybiExfShlLnR5cGUpfHwiYXBwbGljYXRpb24vd2FzbSI9PT1lLmhlYWRlcnMuZ2V0KCJDb250ZW50LVR5cGUiKSl0aHJvdyB0O2NvbnNvbGUud2FybigiYFdlYkFzc2VtYmx5Lmluc3RhbnRpYXRlU3RyZWFtaW5nYCBmYWlsZWQgYmVjYXVzZSB5b3VyIHNlcnZlciBkb2VzIG5vdCBzZXJ2ZSBXYXNtIHdpdGggYGFwcGxpY2F0aW9uL3dhc21gIE1JTUUgdHlwZS4gRmFsbGluZyBiYWNrIHRvIGBXZWJBc3NlbWJseS5pbnN0YW50aWF0ZWAgd2hpY2ggaXMgc2xvd2VyLiBPcmlnaW5hbCBlcnJvcjpcbiIsdCl9Y29uc3Qgbj1hd2FpdCBlLmFycmF5QnVmZmVyKCk7cmV0dXJuIGF3YWl0IFdlYkFzc2VtYmx5Lmluc3RhbnRpYXRlKG4sdCl9e2NvbnN0IG49YXdhaXQgV2ViQXNzZW1ibHkuaW5zdGFudGlhdGUoZSx0KTtyZXR1cm4gbiBpbnN0YW5jZW9mIFdlYkFzc2VtYmx5Lkluc3RhbmNlP3tpbnN0YW5jZTpuLG1vZHVsZTplfTpufX0oYXdhaXQgZSx0KTtyZXR1cm4gZ3Iobil9dmFyIGJyPU9iamVjdC5mcmVlemUoe19fcHJvdG9fXzpudWxsLENvbnRleHQ6bW4sSW50b1VuZGVybHlpbmdCeXRlU291cmNlOlNuLEludG9VbmRlcmx5aW5nU2luazpCbixJbnRvVW5kZXJseWluZ1NvdXJjZTp4bixMc3BTZXJ2ZXJDb25maWc6RW4sUmVzcG9uc2VDb250ZXh0OlVuLFRhbmdlbnRpYWxBcmNJbmZvT3V0cHV0V2FzbTpPbixXYXNtQ2lyY2xlUGFyYW1zOk5uLGJhc2U2NF9kZWNvZGU6ZnVuY3Rpb24oZSl7Y29uc3QgdD1vcihlLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksbj1fcixyPXVyLmJhc2U2NF9kZWNvZGUodCxuKTtpZihyWzNdKXRocm93IHNyKHJbMl0pO3ZhciBpPXFuKHJbMF0sclsxXSkuc2xpY2UoKTtyZXR1cm4gdXIuX193YmluZGdlbl9mcmVlKHJbMF0sMSpyWzFdLDEpLGl9LGNhbGN1bGF0ZV9jaXJjbGVfZnJvbV8zX3BvaW50czpmdW5jdGlvbihlLHQsbixyLGksbyl7Y29uc3Qgcz11ci5jYWxjdWxhdGVfY2lyY2xlX2Zyb21fM19wb2ludHMoZSx0LG4scixpLG8pO3JldHVybiBObi5fX3dyYXAocyl9LGNoYW5nZV9kZWZhdWx0X3VuaXRzOmZ1bmN0aW9uKGUsdCl7bGV0IG4scjt0cnl7Y29uc3Qgcz1vcihlLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksYT1fcixjPW9yKHQsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxsPV9yLGY9dXIuY2hhbmdlX2RlZmF1bHRfdW5pdHMocyxhLGMsbCk7dmFyIGk9ZlswXSxvPWZbMV07aWYoZlszXSl0aHJvdyBpPTAsbz0wLHNyKGZbMl0pO3JldHVybiBuPWkscj1vLFhuKGksbyl9ZmluYWxseXt1ci5fX3diaW5kZ2VuX2ZyZWUobixyLDEpfX0sY2hhbmdlX2V4cGVyaW1lbnRhbF9mZWF0dXJlczpmdW5jdGlvbihlLHQpe2xldCBuLHI7dHJ5e2NvbnN0IHM9b3IoZSx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGE9X3IsYz1vcih0LHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksbD1fcixmPXVyLmNoYW5nZV9leHBlcmltZW50YWxfZmVhdHVyZXMocyxhLGMsbCk7dmFyIGk9ZlswXSxvPWZbMV07aWYoZlszXSl0aHJvdyBpPTAsbz0wLHNyKGZbMl0pO3JldHVybiBuPWkscj1vLFhuKGksbyl9ZmluYWxseXt1ci5fX3diaW5kZ2VuX2ZyZWUobixyLDEpfX0sY2hhbmdlX2tjbF92ZXJzaW9uOmZ1bmN0aW9uKGUsdCl7bGV0IG4scjt0cnl7Y29uc3Qgcz1vcihlLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksYT1fcixjPW9yKHQsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxsPV9yLGY9dXIuY2hhbmdlX2tjbF92ZXJzaW9uKHMsYSxjLGwpO3ZhciBpPWZbMF0sbz1mWzFdO2lmKGZbM10pdGhyb3cgaT0wLG89MCxzcihmWzJdKTtyZXR1cm4gbj1pLHI9byxYbihpLG8pfWZpbmFsbHl7dXIuX193YmluZGdlbl9mcmVlKG4sciwxKX19LGRlZmF1bHRfYXBwX3NldHRpbmdzOmZ1bmN0aW9uKCl7Y29uc3QgZT11ci5kZWZhdWx0X2FwcF9zZXR0aW5ncygpO2lmKGVbMl0pdGhyb3cgc3IoZVsxXSk7cmV0dXJuIHNyKGVbMF0pfSxkZWZhdWx0X3Byb2plY3Rfc2V0dGluZ3M6ZnVuY3Rpb24oKXtjb25zdCBlPXVyLmRlZmF1bHRfcHJvamVjdF9zZXR0aW5ncygpO2lmKGVbMl0pdGhyb3cgc3IoZVsxXSk7cmV0dXJuIHNyKGVbMF0pfSxmb3JtYXRfbnVtYmVyX2xpdGVyYWw6ZnVuY3Rpb24oZSx0LG4pe2xldCByLGk7dHJ5e2NvbnN0IGE9b3IodCx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGM9X3IsbD11ci5mb3JtYXRfbnVtYmVyX2xpdGVyYWwoZSxhLGMsbnIobik/NDI5NDk2NzI5NzpuPj4+MCk7dmFyIG89bFswXSxzPWxbMV07aWYobFszXSl0aHJvdyBvPTAscz0wLHNyKGxbMl0pO3JldHVybiByPW8saT1zLFhuKG8scyl9ZmluYWxseXt1ci5fX3diaW5kZ2VuX2ZyZWUocixpLDEpfX0sZm9ybWF0X251bWJlcl92YWx1ZTpmdW5jdGlvbihlLHQpe2xldCBuLHI7dHJ5e2NvbnN0IHM9b3IodCx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGE9X3IsYz11ci5mb3JtYXRfbnVtYmVyX3ZhbHVlKGUscyxhKTt2YXIgaT1jWzBdLG89Y1sxXTtpZihjWzNdKXRocm93IGk9MCxvPTAsc3IoY1syXSk7cmV0dXJuIG49aSxyPW8sWG4oaSxvKX1maW5hbGx5e3VyLl9fd2JpbmRnZW5fZnJlZShuLHIsMSl9fSxnZXRfa2NsX3ZlcnNpb246ZnVuY3Rpb24oKXtsZXQgZSx0O3RyeXtjb25zdCBuPXVyLmdldF9rY2xfdmVyc2lvbigpO3JldHVybiBlPW5bMF0sdD1uWzFdLFhuKG5bMF0sblsxXSl9ZmluYWxseXt1ci5fX3diaW5kZ2VuX2ZyZWUoZSx0LDEpfX0sZ2V0X3RhbmdlbnRpYWxfYXJjX3RvX2luZm86ZnVuY3Rpb24oZSx0LG4scixpLG8scyl7Y29uc3QgYT11ci5nZXRfdGFuZ2VudGlhbF9hcmNfdG9faW5mbyhlLHQsbixyLGksbyxzKTtyZXR1cm4gT24uX193cmFwKGEpfSxodW1hbl9kaXNwbGF5X251bWJlcjpmdW5jdGlvbihlLHQpe2xldCBuLHI7dHJ5e2NvbnN0IHM9b3IodCx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGE9X3IsYz11ci5odW1hbl9kaXNwbGF5X251bWJlcihlLHMsYSk7dmFyIGk9Y1swXSxvPWNbMV07aWYoY1szXSl0aHJvdyBpPTAsbz0wLHNyKGNbMl0pO3JldHVybiBuPWkscj1vLFhuKGksbyl9ZmluYWxseXt1ci5fX3diaW5kZ2VuX2ZyZWUobixyLDEpfX0saW1wb3J0X2ZpbGVfZXh0ZW5zaW9uczpmdW5jdGlvbigpe2NvbnN0IGU9dXIuaW1wb3J0X2ZpbGVfZXh0ZW5zaW9ucygpO2lmKGVbM10pdGhyb3cgc3IoZVsyXSk7dmFyIHQ9WW4oZVswXSxlWzFdKS5zbGljZSgpO3JldHVybiB1ci5fX3diaW5kZ2VuX2ZyZWUoZVswXSw0KmVbMV0sNCksdH0saXNfa2NsX2VtcHR5X29yX29ubHlfc2V0dGluZ3M6ZnVuY3Rpb24oZSl7Y29uc3QgdD1vcihlLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYyksbj1fcixyPXVyLmlzX2tjbF9lbXB0eV9vcl9vbmx5X3NldHRpbmdzKHQsbik7aWYoclsyXSl0aHJvdyBzcihyWzFdKTtyZXR1cm4gc3IoclswXSl9LGlzX3BvaW50c19jY3c6ZnVuY3Rpb24oZSl7Y29uc3QgdD1pcihlLHVyLl9fd2JpbmRnZW5fbWFsbG9jKSxuPV9yO3JldHVybiB1ci5pc19wb2ludHNfY2N3KHQsbil9LGtjbF9saW50OmZ1bmN0aW9uKGUpe2NvbnN0IHQ9b3IoZSx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLG49X3I7cmV0dXJuIHVyLmtjbF9saW50KHQsbil9LGtjbF9zZXR0aW5nczpmdW5jdGlvbihlKXtjb25zdCB0PW9yKGUsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxuPV9yLHI9dXIua2NsX3NldHRpbmdzKHQsbik7aWYoclsyXSl0aHJvdyBzcihyWzFdKTtyZXR1cm4gc3IoclswXSl9LGxzcF9ydW5fY29waWxvdDpmdW5jdGlvbihlLHQsbil7UG4oZSxFbik7dmFyIHI9ZS5fX2Rlc3Ryb3lfaW50b19yYXcoKTtjb25zdCBpPW9yKHQsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxvPV9yLHM9b3Iobix1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGE9X3I7cmV0dXJuIHVyLmxzcF9ydW5fY29waWxvdChyLGksbyxzLGEpfSxsc3BfcnVuX2tjbDpmdW5jdGlvbihlLHQsbil7UG4oZSxFbik7dmFyIHI9ZS5fX2Rlc3Ryb3lfaW50b19yYXcoKTtjb25zdCBpPW9yKHQsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxvPV9yLHM9b3Iobix1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGE9X3I7cmV0dXJuIHVyLmxzcF9ydW5fa2NsKHIsaSxvLHMsYSl9LG5vZGVfcGF0aF9mcm9tX3JhbmdlOmZ1bmN0aW9uKGUsdCl7Y29uc3Qgbj1vcihlLHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYykscj1fcixpPW9yKHQsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxvPV9yO3JldHVybiB1ci5ub2RlX3BhdGhfZnJvbV9yYW5nZShuLHIsaSxvKX0scGFyc2VfYXBwX3NldHRpbmdzOmZ1bmN0aW9uKGUpe2NvbnN0IHQ9b3IoZSx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLG49X3Iscj11ci5wYXJzZV9hcHBfc2V0dGluZ3ModCxuKTtpZihyWzJdKXRocm93IHNyKHJbMV0pO3JldHVybiBzcihyWzBdKX0scGFyc2VfcHJvamVjdF9zZXR0aW5nczpmdW5jdGlvbihlKXtjb25zdCB0PW9yKGUsdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxuPV9yLHI9dXIucGFyc2VfcHJvamVjdF9zZXR0aW5ncyh0LG4pO2lmKHJbMl0pdGhyb3cgc3IoclsxXSk7cmV0dXJuIHNyKHJbMF0pfSxwYXJzZV93YXNtOkluLHBvaW50X3RvX3VuaXQ6ZnVuY3Rpb24oZSx0LG4pe2NvbnN0IHI9b3IoZSx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLGk9X3Isbz1vcih0LHVyLl9fd2JpbmRnZW5fbWFsbG9jLHVyLl9fd2JpbmRnZW5fcmVhbGxvYykscz1fcixhPW9yKG4sdXIuX193YmluZGdlbl9tYWxsb2MsdXIuX193YmluZGdlbl9yZWFsbG9jKSxjPV9yLGw9dXIucG9pbnRfdG9fdW5pdChyLGksbyxzLGEsYyk7aWYobFszXSl0aHJvdyBzcihsWzJdKTt2YXIgZix1LF89KGY9bFswXSx1PWxbMV0sZj4+Pj0wLEduKCkuc3ViYXJyYXkoZi84LGYvOCt1KSkuc2xpY2UoKTtyZXR1cm4gdXIuX193YmluZGdlbl9mcmVlKGxbMF0sOCpsWzFdLDgpLF99LHJlY2FzdF93YXNtOmZ1bmN0aW9uKGUpe2NvbnN0IHQ9b3IoZSx1ci5fX3diaW5kZ2VuX21hbGxvYyx1ci5fX3diaW5kZ2VuX3JlYWxsb2MpLG49X3Iscj11ci5yZWNhc3Rfd2FzbSh0LG4pO2lmKHJbMl0pdGhyb3cgc3IoclsxXSk7cmV0dXJuIHNyKHJbMF0pfSxyZWxldmFudF9maWxlX2V4dGVuc2lvbnM6ZnVuY3Rpb24oKXtjb25zdCBlPXVyLnJlbGV2YW50X2ZpbGVfZXh0ZW5zaW9ucygpO2lmKGVbM10pdGhyb3cgc3IoZVsyXSk7dmFyIHQ9WW4oZVswXSxlWzFdKS5zbGljZSgpO3JldHVybiB1ci5fX3diaW5kZ2VuX2ZyZWUoZVswXSw0KmVbMV0sNCksdH0sc2VyaWFsaXplX2NvbmZpZ3VyYXRpb246ZnVuY3Rpb24oZSl7Y29uc3QgdD11ci5zZXJpYWxpemVfY29uZmlndXJhdGlvbihlKTtpZih0WzJdKXRocm93IHNyKHRbMV0pO3JldHVybiBzcih0WzBdKX0sc2VyaWFsaXplX3Byb2plY3RfY29uZmlndXJhdGlvbjpmdW5jdGlvbihlKXtjb25zdCB0PXVyLnNlcmlhbGl6ZV9wcm9qZWN0X2NvbmZpZ3VyYXRpb24oZSk7aWYodFsyXSl0aHJvdyBzcih0WzFdKTtyZXR1cm4gc3IodFswXSl9LHNrZXRjaF9jaGVja3BvaW50X2xpbWl0OmZ1bmN0aW9uKCl7cmV0dXJuIHVyLnNrZXRjaF9jaGVja3BvaW50X2xpbWl0KCk+Pj4wfSxpbml0U3luYzpmdW5jdGlvbihlKXtpZih2b2lkIDAhPT11cilyZXR1cm4gdXI7dm9pZCAwIT09ZSYmKE9iamVjdC5nZXRQcm90b3R5cGVPZihlKT09PU9iamVjdC5wcm90b3R5cGU/KHttb2R1bGU6ZX09ZSk6Y29uc29sZS53YXJuKCJ1c2luZyBkZXByZWNhdGVkIHBhcmFtZXRlcnMgZm9yIGBpbml0U3luYygpYDsgcGFzcyBhIHNpbmdsZSBvYmplY3QgaW5zdGVhZCIpKTtjb25zdCB0PXZuKCk7cmV0dXJuIGUgaW5zdGFuY2VvZiBXZWJBc3NlbWJseS5Nb2R1bGV8fChlPW5ldyBXZWJBc3NlbWJseS5Nb2R1bGUoZSkpLGdyKG5ldyBXZWJBc3NlbWJseS5JbnN0YW5jZShlLHQpKX0sZGVmYXVsdDpocn0pO2xldCBkcjtjb25zdCB3cj17ZmlyZU1vZGVsaW5nQ29tbWFuZEZyb21XYXNtKGUsdCxuLHIpe30sc2VuZE1vZGVsaW5nQ29tbWFuZEZyb21XYXNtOmFzeW5jKGUsdCxuLHIpPT4ocG9zdE1lc3NhZ2Uoe3RvOiJ3ZWJzb2NrZXQiLHBheWxvYWQ6e3R5cGU6InNlbmQiLGRhdGE6bn19KSxkcj8uc2VuZChuKSxuZXcgUHJvbWlzZSgodD0+e2NvbnN0IG49cj0+e2lmKHIuZGF0YS5pbmRleE9mKGUpPDApcmV0dXJuO2NvbnN0IGk9KG89SlNPTi5wYXJzZShyLmRhdGEpLG5ldyBmKHMpLmVuY29kZVNoYXJlZFJlZihvKSk7dmFyIG8sczt0KGkpLGRyLnJlbW92ZUV2ZW50TGlzdGVuZXIoIm1lc3NhZ2UiLG4pfTtkci5hZGRFdmVudExpc3RlbmVyKCJtZXNzYWdlIixuKX0pKSksYXN5bmMgc3RhcnROZXdTZXNzaW9uKCl7fX07c2VsZi5hZGRFdmVudExpc3RlbmVyKCJtZXNzYWdlIiwoZT0+e2NvbnN0IHQ9ZS5kYXRhO3N3aXRjaCh0LnRvKXtjYXNlIndvcmtlciI6cmV0dXJuIHZvaWQoInN0YXJ0Ij09PXQucGF5bG9hZC50eXBlJiYoYXN5bmMgZT0+e2F3YWl0IGZldGNoKG5ldyBVUkwoIi9rY2xfd2FzbV9saWJfYmcud2FzbSIsbG9jYXRpb24ub3JpZ2luKSkudGhlbigoZT0+ZS5hcnJheUJ1ZmZlcigpKSkudGhlbigoZT0+aHIoe21vZHVsZV9vcl9wYXRoOmV9KSkpLGRyPW5ldyBXZWJTb2NrZXQoeW4udXJsQ29uc3RydWN0RnJvbSh7d2VicnRjOiEwLC4uLmV9KSksZHIuYWRkRXZlbnRMaXN0ZW5lcigib3BlbiIsKCgpPT57eW4uYXV0aGVudGljYXRlKHtjbGllbnQ6ZS5jbGllbnR9LGRyKX0pLHtvbmNlOiEwfSksZHIuYWRkRXZlbnRMaXN0ZW5lcigibWVzc2FnZSIsKGU9Pntwb3N0TWVzc2FnZSh7ZnJvbToid2Vic29ja2V0IixwYXlsb2FkOnt0eXBlOiJtZXNzYWdlIixkYXRhOmUuZGF0YX19KX0pKSxzZXRJbnRlcnZhbCgoKCk9Pntkci5yZWFkeVN0YXRlPT09V2ViU29ja2V0Lk9QRU4mJmRyLnNlbmQoSlNPTi5zdHJpbmdpZnkoe3R5cGU6InBpbmcifSkpfSksNGUzKX0pKHQucGF5bG9hZC5kYXRhWzBdKSk7Y2FzZSJ3ZWJzb2NrZXQiOnJldHVybiB2b2lkIGRyPy5bdC5wYXlsb2FkLnR5cGVdKC4uLnQucGF5bG9hZC5kYXRhKTtjYXNlIndhc20iOnJldHVybiB2b2lkKCJleGVjdXRlIj09PXQucGF5bG9hZC50eXBlPygoZSx0PXttYWluS2NsUGF0aE5hbWU6Im1haW4ua2NsIn0pPT57Y29uc3Qgbj0ic3RyaW5nIj09dHlwZW9mIGU/KGk9ZSx7cmVhZEZpbGU6YXN5bmMgZT0+KG5ldyBUZXh0RW5jb2RlcikuZW5jb2RlKGkpLGV4aXN0czphc3luYyBlPT4hMSxnZXRBbGxGaWxlczphc3luYyBlPT5baV19KToocj1lLHthc3luYyByZWFkRmlsZShlKXtjb25zdCB0PXIuZ2V0KGUpPz8iIjtyZXR1cm4obmV3IFRleHRFbmNvZGVyKS5lbmNvZGUodCl9LGV4aXN0czphc3luYyBlPT5yLmhhcyhlKSxnZXRBbGxGaWxlczphc3luYyBlPT5BcnJheS5mcm9tKHIudmFsdWVzKCkpfSk7dmFyIHIsaTtjb25zdCBvPSJzdHJpbmciPT10eXBlb2YgZT9lOmUuZ2V0KHQubWFpbktjbFBhdGhOYW1lKSxzPW5ldyBtbih3cixuKSxhPUluKG8pWzBdO3JldHVybiBzLmV4ZWN1dGUoSlNPTi5zdHJpbmdpZnkoYSksdC5tYWluS2NsUGF0aE5hbWUsInt9Iil9KSh0LnBheWxvYWQuZGF0YVswXSx0LnBheWxvYWQuZGF0YVsxXSkudGhlbigoZT0+e3Bvc3RNZXNzYWdlKHtmcm9tOiJ3YXNtIixwYXlsb2FkOnt0eXBlOiJleGVjdXRlIixkYXRhOmV9fSl9KSkuY2F0Y2goKGU9Pntwb3N0TWVzc2FnZSh7ZnJvbToid2FzbSIscGF5bG9hZDp7dHlwZToiZXhlY3V0ZSIsZGF0YTplfX0pfSkpOnBvc3RNZXNzYWdlKGJyW3QucGF5bG9hZC50eXBlXSguLi50LnBheWxvYWQuZGF0YSkpKX19KSl9KCk7Cgo=", null, false);
  var Qn = (t, e) => {
    let n2;
    return { fn: (...t2) => {
      n2 = t2;
    }, intervalId: setInterval((() => {
      if (void 0 === n2) return;
      const e2 = n2;
      n2 = void 0, window.requestAnimationFrame((() => {
        t(...e2);
      }));
    }), e) };
  };
  var On = (function(t) {
    return t[t.DOWN = 0] = "DOWN", t[t.UP = 1] = "UP", t;
  })(On || {});
  var En = (function(t) {
    return t[t.MIDDLE = 1] = "MIDDLE", t[t.RIGHT = 2] = "RIGHT", t;
  })(En || {});
  var _n = { [On.DOWN]: "camera_drag_start", [On.UP]: "camera_drag_end" };
  var Dn = { [En.MIDDLE]: "pan", [En.RIGHT]: "rotatetrackball" };
  var An = class extends EventTarget {
    removeMouseEvents = () => {
    };
    removeResizeObserver = () => {
    };
    constructor(t) {
      super(), this.zooClientArgs = t, this.workerWebRTC = new Fn(), this.rtcPeerConnection = new RTCPeerConnection({ bundlePolicy: "max-bundle" }), this.rtcPeerConnection.addTransceiver("video", { direction: "recvonly" }), this.rtcPeerConnection.createDataChannel("unreliable_modeling_cmds"), this.ice(), this.rtcPeerConnection.addEventListener("track", this.webRTCOnTrack.bind(this)), this.rtcPeerConnection.addEventListener("datachannel", this.webRTCOnDataChannel.bind(this)), this.rtcPeerConnection.addEventListener("connectionstatechange", this.webRTCOnConnectionStateChange.bind(this));
    }
    deconstructor() {
      this.removeMouseEvents(), this.removeResizeObserver(), this.deice(), this.rtcPeerConnection.removeEventListener("track", this.webRTCOnTrack.bind(this)), this.rtcPeerConnection.removeEventListener("datachannel", this.webRTCOnDataChannel.bind(this)), this.rtcPeerConnection.removeEventListener("connectionstatechange", this.webRTCOnConnectionStateChange.bind(this)), this.workerWebRTC.terminate(), this.rtcPeerConnection.close();
    }
    async start() {
      const t = (e) => {
        const n2 = e.data;
        "from" in n2 && "websocket" === n2.from && "payload" in n2 && "object" == typeof n2.payload && "data" in n2.payload && "string" == typeof n2.payload.data && n2.payload.data.indexOf("auth_token_invalid") >= 0 && (this.workerWebRTC.removeEventListener("message", t), this.zooClientArgs.client.oauth2.fetchAuthorizationCode());
      };
      this.zooClientArgs.client.oauth2.getAccessToken().then(((e) => {
        var n2;
        e?.token?.value && (this.zooClientArgs.client.token = e?.token?.value), void 0 === this.zooClientArgs.client.token && (this.zooClientArgs.client.token = "00000000-0000-0000-0000-000000000000"), this.workerWebRTC.addEventListener("message", t), this.workerWebRTC.postMessage({ to: "worker", payload: { type: "start", data: [(n2 = this.zooClientArgs, JSON.parse(JSON.stringify(n2)))] } });
      })).catch(((t2) => {
        "object" == typeof t2 && "kind" in t2 && [EErrorOAuth2.ErrorNoAuthCode, EErrorOAuth2.ErrorAccessTokenResponse].some(((e) => e === t2.kind)) && this.zooClientArgs.client.oauth2.fetchAuthorizationCode();
      }));
    }
    wasm(t, ...e) {
      return new Promise(((n2) => {
        const i2 = (t2) => {
          const e2 = t2.data;
          "from" in e2 && "wasm" === e2.from && (this.workerWebRTC.removeEventListener("message", i2), n2(e2.payload.data));
        };
        this.workerWebRTC.addEventListener("message", i2), this.workerWebRTC.postMessage({ to: "wasm", payload: { type: t, data: e ?? [] } });
      }));
    }
    executor() {
      return { addEventListener: this.workerWebRTC.addEventListener.bind(this.workerWebRTC, "message"), removeEventListener: this.workerWebRTC.removeEventListener.bind(this.workerWebRTC, "message"), submit: (t, e = { mainKclPathName: "main.kcl" }) => new Promise(((n2) => {
        const i2 = (t2) => {
          const e2 = t2.data;
          "from" in e2 && "wasm" === e2.from && "execute" === e2.payload.type && (this.workerWebRTC.removeEventListener("message", i2), n2(e2.payload.data));
        };
        this.workerWebRTC.addEventListener("message", i2), this.workerWebRTC.postMessage({ to: "wasm", payload: { type: "execute", data: [t, e] } });
      })) };
    }
    webRTCOnConnectionStateChange() {
      if ("disconnected" === this.rtcPeerConnection.connectionState) this.dispatchEvent(new Event("close"));
    }
    webRTCOnTrack(t) {
      this.track = t, this.dispatchEvent(new Event("track"));
    }
    webRTCOnDataChannel(t) {
      this.channel = t.channel, this.dispatchEvent(new Event("datachannel")), this.dispatchEvent(new Event("connected"));
    }
    async iceOnIceServerInfo(t) {
      if (0 == t.data.ice_servers.length) return;
      this.rtcPeerConnection.setConfiguration({ bundlePolicy: "max-bundle", iceServers: t.data.ice_servers, iceTransportPolicy: "relay" });
      const e = await this.rtcPeerConnection.createOffer();
      await this.rtcPeerConnection.setLocalDescription(e), this.workerWebRTC.postMessage({ to: "websocket", payload: { type: "send", data: [JSON.stringify({ type: "sdp_offer", offer: e })] } });
    }
    async iceOnSdpAnswer(t) {
      await this.rtcPeerConnection.setRemoteDescription(t.data.answer);
    }
    async iceOnTrickleIce(t) {
      await this.rtcPeerConnection.addIceCandidate(t.data.candidate);
    }
    iceOnIceCandidate(t) {
      null !== t.candidate && this.workerWebRTC.postMessage({ to: "websocket", payload: { type: "send", data: [JSON.stringify({ type: "trickle_ice", candidate: { candidate: t.candidate.candidate, sdpMid: t.candidate.sdpMid || void 0, sdpMLineIndex: t.candidate.sdpMLineIndex || void 0, usernameFragment: t.candidate.usernameFragment || void 0 } })] } });
    }
    iceOnMessage(t) {
      const e = In.parseMessage(t);
      if ("resp" in e) switch (e.resp.type) {
        case "ice_server_info":
          this.iceOnIceServerInfo(e.resp);
          break;
        case "sdp_answer":
          this.iceOnSdpAnswer(e.resp);
          break;
        case "trickle_ice":
          this.iceOnTrickleIce(e.resp);
      }
    }
    workerWebRTCOnMessage(t) {
      const e = t.data;
      "from" in e && "websocket" === e.from && "message" === e.payload.type && this.iceOnMessage(e.payload);
    }
    ice() {
      this.workerWebRTC.addEventListener("message", this.workerWebRTCOnMessage.bind(this)), this.rtcPeerConnection.addEventListener("icecandidate", this.iceOnIceCandidate.bind(this));
    }
    deice() {
      this.workerWebRTC.removeEventListener("message", this.workerWebRTCOnMessage.bind(this)), this.rtcPeerConnection.removeEventListener("icecandidate", this.iceOnIceCandidate);
    }
    addMouseEvents(t) {
      let e, n2 = On.UP;
      const i2 = (t2) => (i3) => {
        const l3 = Dn[i3.button];
        if (void 0 === l3) return;
        const o2 = { type: "send", data: [JSON.stringify({ type: "modeling_cmd_req", cmd_id: "00000000-0000-0000-0000-000000000000", cmd: { type: _n[t2], interaction: l3, window: { x: i3.offsetX, y: i3.offsetY } } })] };
        this.workerWebRTC.postMessage({ to: "websocket", payload: o2 }), this.channel?.send(o2.data[0]), e = i3.button, n2 = t2;
      }, l2 = i2(On.DOWN), o = i2(On.UP), c = (t2) => {
        const i3 = Dn[e];
        if (void 0 === i3) return;
        n2 = On.UP;
        const l3 = { type: "send", data: [JSON.stringify({ type: "modeling_cmd_req", cmd_id: "00000000-0000-0000-0000-000000000000", cmd: { type: _n[n2], interaction: i3, window: { x: t2.offsetX, y: t2.offsetY } } })] };
        this.workerWebRTC.postMessage({ to: "websocket", payload: l3 }), this.channel?.send(l3.data[0]);
      };
      let s = 0;
      const a = Qn(((t2) => {
        n2 === On.DOWN && this.channel?.send(JSON.stringify({ type: "modeling_cmd_req", cmd_id: "00000000-0000-0000-0000-000000000000", cmd: { type: "camera_drag_move", interaction: Dn[e], window: { x: t2.offsetX, y: t2.offsetY } } })), s += 1, this.channel?.send(JSON.stringify({ type: "modeling_cmd_req", cmd_id: "00000000-0000-0000-0000-000000000000", cmd: { type: "mouse_move", sequence: s, window: { x: t2.offsetX, y: t2.offsetY } } }));
      }), 1e3 / 30), d = Qn(((t2) => {
        t2.preventDefault(), this.channel?.send(JSON.stringify({ type: "modeling_cmd_req", cmd_id: "00000000-0000-0000-0000-000000000000", cmd: { type: "default_camera_zoom", magnitude: -1 * Math.sign(t2.deltaY) * window.devicePixelRatio * 50 } }));
      }), 1e3 / 30), b = (e2) => {
        this.channel = e2.channel, t.addEventListener("pointerdown", l2), t.addEventListener("pointermove", a.fn), t.addEventListener("pointerup", o), t.addEventListener("pointerleave", c), t.addEventListener("wheel", d.fn, { passive: false });
      };
      this.rtcPeerConnection.addEventListener("datachannel", b), this.removeMouseEvents = () => {
        this.rtcPeerConnection.removeEventListener("datachannel", b), t.removeEventListener("pointerdown", l2), t.removeEventListener("pointermove", a.fn), clearInterval(a.intervalId), t.removeEventListener("pointerup", o), t.removeEventListener("pointerleave", c), t.removeEventListener("wheel", d.fn), clearInterval(d.intervalId);
      };
    }
    resize(t) {
      window.requestAnimationFrame((() => {
        this.send(JSON.stringify({ type: "modeling_cmd_req", cmd_id: "00000000-0000-0000-0000-000000000000", cmd: { type: "reconfigure_stream", ...t, fps: 30 } }));
      }));
    }
    addResizeObserver(t) {
      const e = t.querySelector("video"), n2 = Qn(((t2) => {
        for (const n3 of t2) {
          const t3 = n3.contentRect.width - n3.contentRect.width % 4, i3 = n3.contentRect.height - n3.contentRect.height % 4;
          e.width = t3, e.height = i3, this.resize({ width: t3, height: i3 });
        }
      }), 62.5), i2 = new ResizeObserver(n2.fn);
      i2.observe(t), this.removeResizeObserver = () => {
        clearInterval(n2.intervalId), i2.disconnect();
      };
    }
    send(...t) {
      return new Promise(((e) => {
        const n2 = (t2) => {
          const i2 = t2.data;
          "from" in i2 && "websocket" === i2.from && (this.workerWebRTC.removeEventListener("message", n2), e(i2.payload.data));
        };
        this.workerWebRTC.addEventListener("message", n2), this.workerWebRTC.postMessage({ to: "websocket", payload: { type: "send", data: t } });
      }));
    }
  };

  // src/svg-zoo.ts
  var svg_zoo_default = '<svg viewBox="0 -2 245 84" fill="none" xmlns="http://www.w3.org/2000/svg"><g><path fill="currentcolor" d="M49.1899 14.2024V1.75536H0.0079789V19.3089H44.4824L0.0159578 67.5334H0.0079789V67.5414L0 67.5493L0.0079789 67.5573V79.3501H11.4018L22.8755 66.903V79.3501H72.0574V61.7965H27.591L72.0574 13.5641V1.75536L60.6556 1.77131L49.1899 14.2024Z"></path><path fill="currentcolor" fill-rule="evenodd" clip-rule="evenodd" d="M116.723 17.5536C103.981 17.5536 93.6164 27.9182 93.6164 40.6605C93.6164 45.751 95.276 50.4665 98.0846 54.2884L86.0205 67.2781C79.8129 60.1369 76.0628 50.8256 76.0628 40.6605C76.0628 18.2398 94.3026 0 116.723 0C125.819 0 134.221 3.00007 141.003 8.06666L128.939 21.0563C125.396 18.8382 121.207 17.5536 116.723 17.5536ZM139.83 40.6605C139.83 35.5699 138.171 30.8544 135.37 27.0245L147.426 14.0349C153.634 21.176 157.384 30.4874 157.384 40.6605C157.384 63.0732 139.144 81.3129 116.723 81.3129C107.627 81.3129 99.2256 78.3129 92.4435 73.2542L104.516 60.2566C108.058 62.4748 112.239 63.7594 116.723 63.7594C129.466 63.7594 139.83 53.3948 139.83 40.6605Z"></path><path fill="currentcolor" fill-rule="evenodd" clip-rule="evenodd" d="M204.34 17.5536C191.597 17.5536 181.233 27.9182 181.233 40.6605C181.233 45.751 182.892 50.4665 185.701 54.2884L173.637 67.2781C167.429 60.1369 163.679 50.8256 163.679 40.6605C163.679 18.2398 181.919 0 204.34 0C213.435 0 221.837 3.00007 228.619 8.06666L216.555 21.0563C213.013 18.8382 208.824 17.5536 204.34 17.5536ZM222.986 27.0245L235.042 14.0349C241.25 21.176 245 30.4874 245 40.6605C245 63.0732 226.76 81.3129 204.34 81.3129C195.244 81.3129 186.842 78.3129 180.06 73.2542L192.132 60.2566C195.674 62.4748 199.855 63.7594 204.34 63.7594C217.082 63.7594 227.446 53.3948 227.446 40.6605C227.446 35.5699 225.787 30.8544 222.986 27.0245Z"></path></g></svg>';

  // src/index.ts
  window.zoo ??= {};
  window.zoo.kittycadWebViews ??= [];
  var preventDefault = (e) => e.preventDefault();
  var adjustSize = (size) => ({
    width: size.width - size.width % 4,
    height: size.height - size.height % 4
  });
  var capStreamSize = (size) => {
    const maxDimension = 2560;
    const scale = Math.min(1, maxDimension / size.width, maxDimension / size.height);
    return adjustSize({
      width: Math.floor(size.width * scale),
      height: Math.floor(size.height * scale)
    });
  };
  var ensureTokenClientCanStartWebRTC = (client) => {
    const clientWithShim = client;
    if (clientWithShim.token === void 0 || clientWithShim.oauth2 !== void 0) return;
    clientWithShim.oauth2 = {
      getAccessToken: async () => void 0,
      fetchAuthorizationCode: async () => {
      }
    };
  };
  var ZooWebView = class _ZooWebView extends EventTarget {
    el;
    rtc = void 0;
    size;
    state = "fresh" /* Fresh */;
    allowConcurrentViews;
    elStart;
    elVideo;
    sizeAdjusted;
    streamSize;
    zooClient;
    constructor(args) {
      super();
      this.size = args.size;
      this.sizeAdjusted = adjustSize(args.size);
      this.streamSize = capStreamSize(this.sizeAdjusted);
      this.zooClient = args.zooClient;
      this.allowConcurrentViews = args.allowConcurrentViews ?? false;
      this.el = _ZooWebView.createElements({
        size: this.sizeAdjusted,
        showStartLogo: args.showStartLogo ?? true
      });
      const elVideo = this.el.querySelector("video");
      if (elVideo === null) throw new Error("ZooWebView video element is missing");
      this.elVideo = elVideo;
      elVideo.addEventListener("contextmenu", preventDefault);
      const elStart = this.el.querySelector("div.start");
      if (elStart === null) throw new Error("ZooWebView start element is missing");
      this.elStart = elStart;
      this.state = "fresh" /* Fresh */;
      window.zoo?.kittycadWebViews?.push(this);
      const elStartClick = () => {
        this.start();
      };
      elStart.addEventListener("click", elStartClick);
    }
    start() {
      if (["running" /* Running */, "starting" /* Starting */].indexOf(this.state) >= 0) return;
      this.dispatchEvent(new CustomEvent("status", { detail: "starting" }));
      _ZooWebView.decoOn(this.sizeAdjusted, this.el, this.elStart);
      ensureTokenClientCanStartWebRTC(this.zooClient);
      const zooWebRTC = new An({
        client: this.zooClient,
        video_res_width: this.streamSize.width,
        video_res_height: this.streamSize.height,
        order_independent_transparency: true,
        show_grid: true,
        post_effect: "ssao",
        fps: 30
      });
      this.rtc = zooWebRTC;
      zooWebRTC.addResizeObserver(this.el);
      const workerWebRTC = zooWebRTC.workerWebRTC;
      workerWebRTC?.addEventListener("message", (event) => {
        const data = event.data;
        if (data?.from !== "debug") return;
        const payload = data.payload;
        const status = typeof payload === "string" ? payload : payload?.status;
        if (status === "ws-message") return;
        if (this.state === "running" /* Running */ && status?.startsWith("ws-")) return;
        if (typeof status === "string") {
          this.dispatchEvent(new CustomEvent("status", { detail: status }));
        }
      });
      workerWebRTC?.addEventListener("error", (event) => {
        this.dispatchEvent(new CustomEvent("status", { detail: event.message }));
      });
      if (!this.allowConcurrentViews) {
        window.zoo?.kittycadWebViews?.filter((v2) => ["running" /* Running */, "starting" /* Starting */].indexOf(v2.state) >= 0).forEach((v2) => v2.deconstructor());
      }
      this.state = "starting" /* Starting */;
      const onClose = () => {
        this.deconstructor();
      };
      zooWebRTC.addEventListener("close", onClose, { once: true });
      const onTrack = (event) => {
        if (!(event.target instanceof An)) return;
        this.elVideo.srcObject = event.target.track?.streams[0] ?? null;
      };
      zooWebRTC.addEventListener("track", onTrack, { once: true });
      const onConnected = (_event) => {
        void this.elVideo.play().catch(console.warn);
        this.rtc = zooWebRTC;
        this.state = "running" /* Running */;
        this.dispatchEvent(new CustomEvent("status", { detail: "connected" }));
        this.dispatchEvent(new Event("ready"));
      };
      zooWebRTC.addMouseEvents(this.elVideo);
      zooWebRTC.addEventListener("connected", onConnected, { once: true });
      void zooWebRTC.start().catch((error) => {
        this.state = "killed" /* Killed */;
        console.error("ZooWebView failed to start", error);
        this.dispatchEvent(new CustomEvent("status", { detail: "start failed" }));
        this.dispatchEvent(new CustomEvent("error", { detail: error }));
      });
    }
    deconstructor() {
      this.state = "killed" /* Killed */;
      this.elVideo.pause();
      _ZooWebView.decoOff(this.size, this.el, this.elStart);
      return Promise.allSettled([
        this.rtc?.deconstructor()
      ]).finally(() => {
        this.rtc = void 0;
      });
    }
    static decoOff(size, elZooWebView, elStart) {
      elZooWebView.style.width = `${size.width}px`;
      elZooWebView.style.height = `${size.height}px`;
      elZooWebView.style.justifyContent = "center";
      elZooWebView.style.alignItems = "center";
      elZooWebView.style.cursor = "pointer";
      elZooWebView.style.backgroundColor = "#1c1c1c";
      elStart.style.paddingTop = "";
      elStart.style.paddingRight = "";
      elStart.style.width = `${size.width / 2}px`;
      elStart.style.position = "absolute";
      elStart.style.color = "hsl(154deg 100% 25%)";
    }
    static decoOn(size, elZooWebView, elStart) {
      elZooWebView.style.justifyContent = "right";
      elZooWebView.style.alignItems = "flex-start";
      elStart.style.width = `${size.width / 4}px`;
      elStart.style.color = "hsl(154deg 100% 58%)";
      elStart.style.paddingTop = "0.5em";
      elStart.style.paddingRight = "0.5em";
    }
    static createElements(args) {
      const elZooWebView = document.createElement("div");
      const elVideo = document.createElement("video");
      const elStart = document.createElement("div");
      elStart.classList.add("start");
      if (args.showStartLogo ?? true) {
        elStart.innerHTML = svg_zoo_default;
      }
      elVideo.width = args.size.width - args.size.width % 4;
      elVideo.height = args.size.height - args.size.height % 4;
      elVideo.autoplay = true;
      elVideo.muted = true;
      elVideo.playsInline = true;
      elVideo.style.display = "block";
      elVideo.style.width = "100%";
      elVideo.style.height = "100%";
      elVideo.style.objectFit = "cover";
      elZooWebView.style.display = "flex";
      elZooWebView.style.position = "relative";
      elZooWebView.style.overflow = "hidden";
      elZooWebView.style.overscrollBehavior = "contain";
      _ZooWebView.decoOff(args.size, elZooWebView, elStart);
      elZooWebView.appendChild(elVideo);
      elZooWebView.appendChild(elStart);
      return elZooWebView;
    }
  };

  // src/example.ts
  var rows = 3;
  var cols = 3;
  var centerIndex = 4;
  var rootAgentId = "zookeeper-orchestrator-root";
  var perimeterOrder = [0, 1, 2, 5, 8, 7, 6, 3];
  var mockAgentCount = 50;
  var maxAgentRepairAttempts = 2;
  var maxZooFallbackRetries = 3;
  var zooFallbackRetryBackoffMs = 2200;
  var defaultPrompt = "Design a small rocket engine assembly";
  var rootFilePath = "main.kcl";
  var agentColors = [
    "#00A3FF",
    "#FF4F8B",
    "#F5C542",
    "#44D07B",
    "#C084FC",
    "#FF8A3D",
    "#2DD4BF",
    "#94A3B8",
    "#F97316",
    "#22C55E",
    "#38BDF8",
    "#E879F9"
  ];
  var installWorkerWebSocketSendQueuePatch = () => {
    const nativeWorker = window.Worker;
    window.Worker = class WorkerWithZooWebSocketQueue extends nativeWorker {
      constructor(scriptURL, options) {
        const scriptUrlString = scriptURL.toString();
        if (!scriptUrlString.startsWith("blob:")) {
          super(scriptURL, options);
          return;
        }
        const request = new XMLHttpRequest();
        request.open("GET", scriptUrlString, false);
        request.send();
        let source = request.responseText;
        if (source.includes("new WebSocket(yn.urlConstructFrom") && source.includes('case"websocket":return void dr?.[t.payload.type](...t.payload.data);')) {
          source = source.replace(
            'async e=>{await fetch(new URL("/kcl_wasm_lib_bg.wasm",location.origin))',
            'async e=>{postMessage({from:"debug",payload:{status:"worker-start",origin:location.origin}});await fetch(new URL("/kcl_wasm_lib_bg.wasm",location.origin))'
          ).replace(
            "then((e=>hr({module_or_path:e}))),dr=new WebSocket",
            'then((e=>hr({module_or_path:e}))),postMessage({from:"debug",payload:{status:"wasm-ready"}}),dr=new WebSocket'
          ).replace(
            'dr=new WebSocket(yn.urlConstructFrom({webrtc:!0,...e})),dr.addEventListener("open"',
            'dr=new WebSocket(yn.urlConstructFrom({webrtc:!0,...e})),postMessage({from:"debug",payload:{status:"ws-created",url:String(yn.urlConstructFrom({webrtc:!0,...e}))}}),dr.addEventListener("open"'
          ).replace(
            "let dr;const wr=",
            "let dr;const _zooWsQueue=[];const _zooFlushWs=()=>{if(dr?.readyState!==WebSocket.OPEN)return;for(const e of _zooWsQueue.splice(0))dr[e.type](...e.data)};const wr="
          ).replace(
            'dr.addEventListener("open",(()=>{yn.authenticate({client:e.client},dr)}),{once:!0})',
            'dr.addEventListener("open",(()=>{postMessage({from:"debug",payload:{status:"ws-open"}}),yn.authenticate({client:e.client},dr),_zooFlushWs()}),{once:!0})'
          ).replace(
            'dr.addEventListener("message",(e=>{postMessage({from:"websocket",payload:{type:"message",data:e.data}})}))',
            'dr.addEventListener("message",(e=>{postMessage({from:"debug",payload:{status:"ws-message"}}),postMessage({from:"websocket",payload:{type:"message",data:e.data}})})),dr.addEventListener("error",(()=>{postMessage({from:"debug",payload:{status:"ws-error"}})})),dr.addEventListener("close",(e=>{postMessage({from:"debug",payload:{status:`ws-close ${e.code} ${e.reason||""}`}})}))'
          ).replace(
            'case"websocket":return void dr?.[t.payload.type](...t.payload.data);',
            'case"websocket":return void (dr?.readyState===WebSocket.OPEN?dr[t.payload.type](...t.payload.data):_zooWsQueue.push(t.payload));'
          );
        }
        const patchedUrl = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
        super(patchedUrl, options);
      }
    };
  };
  var tileSize = () => ({
    width: window.innerWidth / cols,
    height: window.innerHeight / rows
  });
  var paneViewerSize = (agentCount = mockAgentCount) => {
    const size = tileSize();
    const maxAgentsPerMonitor = Math.max(1, Math.ceil(agentCount / perimeterOrder.length));
    const columns = maxAgentsPerMonitor <= 1 ? 1 : Math.ceil(Math.sqrt(maxAgentsPerMonitor));
    const rows2 = Math.ceil(maxAgentsPerMonitor / columns);
    return {
      width: Math.max(480, Math.floor(size.width / columns)),
      height: Math.max(270, Math.floor(size.height / rows2))
    };
  };
  var rootViewerSize = () => {
    const size = tileSize();
    return {
      width: Math.floor(size.width),
      height: Math.floor(size.height)
    };
  };
  var errorToMessage = (error) => {
    if (error instanceof Error) return error.message;
    return String(error);
  };
  var wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  var isRetryableZooFallback = (update) => update.source === "fallback" && /\b(websocket closed|closed while reading frame|timed out|timeout|without an EditKclCode output|socket|connection reset|connection closed)\b/i.test(update.summary);
  var escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  var titleCase = (value) => value.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1));
  var sequenceFromId = (id) => id.match(/(\d{4})$/)?.[1];
  var graphPrimaryLabel = (agent) => {
    if (agent.id === rootAgentId) return "Zookeeper Orchestrator";
    return titleCase(agent.role);
  };
  var graphSecondaryLabel = (agent) => {
    if (agent.id === rootAgentId) return "";
    const sequence = sequenceFromId(agent.id);
    const agentLabel = agent.kind === "orchestrator" ? "Sub-Orchestrator" : "Worker";
    return `${agentLabel}${sequence === void 0 ? "" : ` ${sequence}`} / ${agent.status}`;
  };
  var truncateLabel = (value, maxLength) => {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
  };
  var greatestCommonDivisor = (left, right) => {
    if (right === 0) return left;
    return greatestCommonDivisor(right, left % right);
  };
  var leastCommonMultiple = (left, right) => {
    if (left === 0 || right === 0) return Math.max(left, right);
    return Math.abs(left * right) / greatestCommonDivisor(left, right);
  };
  var columnItemCounts = (layoutCount, columnCount) => {
    if (layoutCount === 0) return Array.from({ length: columnCount }, () => 0);
    const fullColumnCount = Math.floor(layoutCount / columnCount);
    const remainder = layoutCount % columnCount;
    return Array.from({ length: columnCount }, (_2, columnIndex) => fullColumnCount + (columnIndex < remainder ? 1 : 0));
  };
  var randomId = () => {
    if (window.crypto?.randomUUID !== void 0) return window.crypto.randomUUID();
    return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
  };
  var sendInitialCameraCommands = (webView) => {
    webView.rtc?.send(JSON.stringify({
      type: "modeling_cmd_batch_req",
      requests: [
        {
          cmd: {
            type: "edge_lines_visible",
            hidden: false
          },
          cmd_id: "00000000-0000-0000-0000-000000000000"
        },
        {
          cmd: {
            type: "zoom_to_fit",
            object_ids: [],
            padding: 0
          },
          cmd_id: "00000000-0000-0000-0000-000000000000"
        }
      ],
      batch_id: "00000000-0000-0000-0000-000000000000",
      responses: true
    }));
  };
  var sendInspectionCameraCommand = (webView, agentIndex, step) => {
    if (webView.rtc === void 0) return;
    const angle = step * 0.82 + agentIndex * 0.47;
    const radius = 6.2 + agentIndex % 5 * 0.35;
    const z2 = 2.6 + step % 4 * 0.24 + agentIndex % 3 * 0.18;
    const request = webView.rtc.send(JSON.stringify({
      type: "modeling_cmd_batch_req",
      requests: [
        {
          cmd: {
            type: "default_camera_look_at",
            center: { x: 0, y: 0, z: 0.85 },
            sequence: step,
            up: { x: 0, y: 0, z: 1 },
            vantage: {
              x: Number((Math.cos(angle) * radius).toFixed(4)),
              y: Number((Math.sin(angle) * radius).toFixed(4)),
              z: Number(z2.toFixed(4))
            }
          },
          cmd_id: randomId()
        },
        {
          cmd: {
            type: "zoom_to_fit",
            object_ids: [],
            padding: 0
          },
          cmd_id: randomId()
        }
      ],
      batch_id: randomId(),
      responses: true
    }));
    void request.catch(() => {
    });
  };
  var sendRootCameraCommand = (webView) => {
    if (webView.rtc === void 0) return;
    const request = webView.rtc.send(JSON.stringify({
      type: "modeling_cmd_batch_req",
      requests: [
        {
          cmd: {
            type: "default_camera_look_at",
            center: { x: 0, y: 0, z: 1.1 },
            sequence: 1,
            up: { x: 0, y: 0, z: 1 },
            vantage: { x: 10.5, y: -11.5, z: 6.4 }
          },
          cmd_id: randomId()
        },
        {
          cmd: {
            type: "zoom_to_fit",
            object_ids: [],
            padding: 0
          },
          cmd_id: randomId()
        }
      ],
      batch_id: randomId(),
      responses: true
    }));
    void request.catch(() => {
    });
  };
  var aliasForFilePath = (filePath) => {
    const basename = filePath.replace(/\.kcl$/i, "").split("/").pop() ?? "part";
    const words = basename.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "part";
    const alias = `${words[0].toLowerCase()}${words.slice(1).map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join("")}`;
    return /^\d/.test(alias) ? `part${alias}` : alias;
  };
  var renderPathForFilePath = (filePath) => filePath === rootFilePath ? rootFilePath : filePath.split("/").pop() ?? filePath;
  var mainFileFor = (filePaths) => `${filePaths.map((filePath) => `import "${renderPathForFilePath(filePath)}" as ${aliasForFilePath(filePath)}`).join("\n")}
`;
  var objectFromMap = (files) => Object.fromEntries(files.entries());
  var stripImportLines = (source) => source.split("\n").filter((line) => !line.trim().startsWith("import ")).join("\n");
  var createZooClient = () => {
    const zooApiToken = window.ZOO_API_TOKEN ?? window.localStorage.getItem("ZOO_API_TOKEN") ?? void 0;
    const zooClient = zooApiToken === void 0 ? new n({
      baseUrl: "https://api.zoo.dev",
      clientId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      redirectUrl: "http://localhost:3000",
      scopes: ["modeling"]
    }) : new n({
      token: zooApiToken,
      baseUrl: "https://api.zoo.dev"
    });
    if (zooApiToken === void 0) {
      void zooClient.isReturningFromAuthServer().then(async (hasAuthCode) => {
        if (!hasAuthCode) return;
        const data = await zooClient.getAccessToken();
        if (data?.token?.value === void 0) return;
        zooClient.token = data.token.value;
      });
    }
    return zooClient;
  };
  document.addEventListener("DOMContentLoaded", () => {
    installWorkerWebSocketSendQueuePatch();
    const zooClient = createZooClient();
    const root = document.createElement("main");
    root.classList.add("wall-root");
    document.body.append(root);
    const monitorElements = /* @__PURE__ */ new Map();
    const agents = /* @__PURE__ */ new Map();
    const timers = /* @__PURE__ */ new Set();
    const cameraTimers = /* @__PURE__ */ new Set();
    const reviewTimers = /* @__PURE__ */ new Map();
    const placementTimers = /* @__PURE__ */ new Map();
    let runId = 0;
    let startInProgress = false;
    let active = false;
    let plannedAgentCount = 0;
    let activeSessionId = "";
    let activeSource = "fallback";
    let rootReviewRounds = 0;
    let rootInstruction = "Coordinate the complete assembly and merge child KCL into the root view.";
    let kclFiles = /* @__PURE__ */ new Map();
    const centerTile = document.createElement("section");
    centerTile.classList.add("wall-tile", "orchestrator-tile");
    const centerView = new ZooWebView({
      zooClient,
      size: rootViewerSize(),
      allowConcurrentViews: true,
      showStartLogo: true
    });
    centerView.el.classList.add("wall-view", "orchestrator-view");
    const centerStatus = document.createElement("div");
    centerStatus.classList.add("center-status");
    centerStatus.textContent = "Mock websocket ready";
    const promptInput = document.createElement("textarea");
    promptInput.classList.add("orchestrator-prompt");
    promptInput.value = defaultPrompt;
    promptInput.spellcheck = false;
    const startButton = document.createElement("button");
    startButton.type = "button";
    startButton.classList.add("orchestrator-start");
    startButton.textContent = "Start Zookeeper";
    const stopButton = document.createElement("button");
    stopButton.type = "button";
    stopButton.classList.add("orchestrator-stop");
    stopButton.textContent = "Stop";
    const rootLog = document.createElement("div");
    rootLog.classList.add("websocket-log");
    const rootGraph = document.createElement("div");
    rootGraph.classList.add("orchestrator-graph");
    const orchestratorConsole = document.createElement("section");
    orchestratorConsole.classList.add("orchestrator-console");
    orchestratorConsole.innerHTML = `
    <div class="orchestrator-heading">
      <div>
        <h1>Zookeeper Orchestrator</h1>
      </div>
      <div class="mode-pill">mock</div>
    </div>
    <label class="prompt-label">Prompt</label>
  `;
    const controls = document.createElement("div");
    controls.classList.add("orchestrator-controls");
    controls.append(startButton, stopButton);
    const graphPanel = document.createElement("section");
    graphPanel.classList.add("graph-panel");
    graphPanel.innerHTML = `
    <div class="graph-heading">
      <div>
        <h2>Live Agent Graph</h2>
      </div>
      <div class="graph-count">0 agents</div>
    </div>
  `;
    graphPanel.appendChild(rootGraph);
    const assemblyPanel = document.createElement("section");
    assemblyPanel.classList.add("assembly-section");
    assemblyPanel.innerHTML = `
    <div class="graph-heading">
      <div>
        <h2>Assembly View</h2>
      </div>
      <div class="graph-count">center</div>
    </div>
  `;
    const assemblyRenderer = document.createElement("div");
    assemblyRenderer.classList.add("assembly-renderer");
    assemblyRenderer.append(centerView.el);
    assemblyPanel.appendChild(assemblyRenderer);
    orchestratorConsole.append(promptInput, controls, centerStatus, assemblyPanel, rootLog);
    const centerOverlay = document.createElement("div");
    centerOverlay.classList.add("orchestrator-overlay");
    centerOverlay.append(orchestratorConsole, graphPanel);
    centerTile.append(centerOverlay);
    const writeLog = (target, line, direction = "sys") => {
      const row = document.createElement("div");
      row.classList.add("log-row", `log-${direction}`);
      row.textContent = line;
      target.appendChild(row);
      while (target.childElementCount > 80) target.firstElementChild?.remove();
      target.scrollTop = target.scrollHeight;
    };
    const rootLogLine = (line, direction = "sys") => {
      writeLog(rootLog, line, direction);
    };
    const graphNode = (id) => {
      if (id === rootAgentId) {
        return {
          id: rootAgentId,
          parentId: "",
          kind: "orchestrator",
          name: "Zookeeper Orchestrator",
          role: "root assembly planner",
          instruction: rootInstruction,
          color: "#FFFFFF",
          status: active ? "running" : "queued",
          filePath: rootFilePath,
          source: activeSource
        };
      }
      return agents.get(id);
    };
    const graphChildren = (id) => Array.from(agents.values()).filter((agent) => agent.parentId === id).sort((a, b) => a.id.localeCompare(b.id));
    const renderGraphFor = (container, startId, compact) => {
      const edges = [];
      const points = /* @__PURE__ */ new Map();
      const visited = /* @__PURE__ */ new Set();
      const nodeWidth = compact ? 220 : 300;
      const nodeHeight = compact ? 58 : 64;
      const columnGap = compact ? 52 : 66;
      const rowGap = compact ? 18 : 24;
      const paddingX = compact ? 20 : 28;
      const paddingY = compact ? 24 : 34;
      const columnWidth = nodeWidth + columnGap;
      const rowHeight = nodeHeight + rowGap;
      let row = 0;
      let maxDepth = 0;
      const layoutTree = (id, depth) => {
        if (visited.has(id)) {
          return points.get(id)?.y ?? paddingY;
        }
        visited.add(id);
        maxDepth = Math.max(maxDepth, depth);
        const children = graphChildren(id);
        let y2;
        if (children.length === 0) {
          y2 = paddingY + row * rowHeight;
          row += 1;
        } else {
          const childYs = children.map((child) => {
            edges.push([id, child.id]);
            return layoutTree(child.id, depth + 1);
          });
          y2 = (childYs[0] + childYs[childYs.length - 1]) / 2;
        }
        points.set(id, {
          x: paddingX + depth * columnWidth,
          y: y2,
          depth
        });
        return y2;
      };
      layoutTree(startId, 0);
      const contentWidth = paddingX * 2 + (maxDepth + 1) * nodeWidth + maxDepth * columnGap;
      const contentHeight = paddingY * 2 + Math.max(1, row) * rowHeight;
      const width = Math.max(compact ? 760 : 1400, contentWidth);
      const height = Math.max(compact ? 460 : 900, contentHeight);
      const shiftX = (width - contentWidth) / 2;
      const shiftY = (height - contentHeight) / 2;
      points.forEach((point) => {
        point.x += shiftX;
        point.y += shiftY;
      });
      const edgeSvg = edges.map(([from, to]) => {
        const start = points.get(from);
        const end = points.get(to);
        if (start === void 0 || end === void 0) return "";
        const startX = start.x + nodeWidth;
        const startY = start.y + nodeHeight / 2;
        const endX = end.x;
        const endY = end.y + nodeHeight / 2;
        const midX = startX + (endX - startX) / 2;
        return `<path class="graph-edge" d="M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}" />`;
      }).join("");
      const nodeSvg = Array.from(points.entries()).map(([id, point]) => {
        const agent = graphNode(id);
        if (agent === void 0 || point === void 0) return "";
        const maxTitleLength = compact ? 25 : 34;
        const primaryLabel = truncateLabel(graphPrimaryLabel(agent), maxTitleLength);
        const secondaryLabel = truncateLabel(graphSecondaryLabel(agent), compact ? 32 : 40);
        const primaryY = secondaryLabel === "" ? nodeHeight / 2 + 5 : compact ? 24 : 26;
        const secondarySvg = secondaryLabel === "" ? "" : `<text class="graph-role" x="14" y="${compact ? 43 : 46}">${escapeHtml(secondaryLabel)}</text>`;
        return `
        <g class="graph-node graph-${agent.kind}" transform="translate(${point.x} ${point.y})">
          <rect width="${nodeWidth}" height="${nodeHeight}" rx="6" style="--node-color: ${agent.color}" />
          <text class="graph-name" x="14" y="${primaryY}">${escapeHtml(primaryLabel)}</text>
          ${secondarySvg}
        </g>
      `;
      }).join("");
      container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet">
        ${edgeSvg}
        ${nodeSvg}
      </svg>
    `;
    };
    const renderAllGraphs = () => {
      renderGraphFor(rootGraph, rootAgentId, false);
      graphPanel.querySelector(".graph-count").textContent = `${agents.size} agents`;
      for (const agent of agents.values()) {
        if (agent.kind !== "orchestrator" || agent.graphElement === void 0) continue;
        renderGraphFor(agent.graphElement, agent.id, true);
      }
    };
    const layoutAgents = () => {
      const buckets = perimeterOrder.map(() => []);
      Array.from(agents.values()).forEach((agent, index) => {
        buckets[index % perimeterOrder.length].push(agent);
      });
      buckets.forEach((bucket, bucketIndex) => {
        const monitorIndex = perimeterOrder[bucketIndex];
        const monitor = monitorElements.get(monitorIndex);
        if (monitor === void 0) return;
        const plannedCount = plannedAgentCount === 0 ? 0 : Math.floor(plannedAgentCount / perimeterOrder.length) + (bucketIndex < plannedAgentCount % perimeterOrder.length ? 1 : 0);
        const layoutCount = Math.max(bucket.length, plannedCount);
        const columnCount = layoutCount <= 1 ? 1 : Math.ceil(Math.sqrt(layoutCount));
        const nextElements = bucket.map((agent) => agent.element).filter(Boolean);
        const currentElements = Array.from(monitor.children);
        const itemsByColumn = columnItemCounts(layoutCount, columnCount);
        const rowTrackCount = Math.max(1, itemsByColumn.filter(Boolean).reduce(leastCommonMultiple, 1));
        nextElements.forEach((element, elementIndex) => {
          let columnIndex = 0;
          let positionInColumn = elementIndex;
          for (; columnIndex < itemsByColumn.length; columnIndex += 1) {
            const itemCount = itemsByColumn[columnIndex];
            if (positionInColumn < itemCount) break;
            positionInColumn -= itemCount;
          }
          const columnItemCount = itemsByColumn[columnIndex] || 1;
          const rowSpan = Math.max(1, rowTrackCount / columnItemCount);
          const rowStart = positionInColumn * rowSpan + 1;
          element.style.gridColumn = `${columnIndex + 1} / span 1`;
          element.style.gridRow = `${rowStart} / span ${rowSpan}`;
        });
        monitor.style.gridTemplateColumns = `repeat(${columnCount}, minmax(0, 1fr))`;
        monitor.style.gridTemplateRows = `repeat(${rowTrackCount}, minmax(0, 1fr))`;
        monitor.classList.toggle("agent-monitor-empty", bucket.length === 0);
        if (currentElements.length !== nextElements.length || currentElements.some((element, index) => element !== nextElements[index])) {
          monitor.replaceChildren(...nextElements);
        }
      });
    };
    const submitProject = (view, project, onFailure, onSuccess) => {
      if (view.rtc === void 0) return Promise.resolve();
      const executor = view.rtc.executor();
      return executor.submit(project.files, { mainKclPathName: project.mainFilePath }).then(() => {
        sendInitialCameraCommands(view);
        onSuccess?.();
      }).catch((error) => {
        onFailure(errorToMessage(error));
        throw error;
      });
    };
    const agentForFilePath = (filePath) => Array.from(agents.values()).find((agent) => agent.filePath === filePath);
    const descendantFilePaths = (agent) => [
      agent.filePath,
      ...graphChildren(agent.id).flatMap((child) => descendantFilePaths(child))
    ];
    const renderFilePathsFor = (entryFilePath) => {
      if (entryFilePath === rootFilePath) {
        return [
          rootFilePath,
          ...Array.from(agents.values()).map((agent2) => agent2.filePath)
        ];
      }
      const agent = agentForFilePath(entryFilePath);
      if (agent === void 0) return [entryFilePath];
      return descendantFilePaths(agent);
    };
    const renderContentForFile = (filePath) => {
      let source = kclFiles.get(filePath) ?? "";
      Array.from(kclFiles.keys()).forEach((knownPath) => {
        source = source.split(`"${knownPath}"`).join(`"${renderPathForFilePath(knownPath)}"`);
      });
      return source;
    };
    const renderProjectFor = (entryFilePath) => ({
      mainFilePath: renderPathForFilePath(entryFilePath),
      files: new Map(
        renderFilePathsFor(entryFilePath).map((filePath) => [renderPathForFilePath(filePath), renderContentForFile(filePath)])
      )
    });
    const submitRootProject = () => {
      if (kclFiles.size === 0) return;
      void submitProject(centerView, renderProjectFor(rootFilePath), (message) => {
        centerStatus.textContent = `Center KCL failed: ${message}`;
      }, () => {
        sendRootCameraCommand(centerView);
      }).catch(() => {
      });
    };
    const submitAgentProject = async (agent, onSuccess) => {
      if (kclFiles.size === 0 || agent.view === void 0) return { ok: false, message: "agent view not ready" };
      const project = renderProjectFor(agent.filePath);
      let failureMessage = "";
      try {
        await submitProject(agent.view, project, (message) => {
          failureMessage = message;
          setAgentStatus(agent, "error");
          appendAgentLog(agent, `kcl failed: ${message}`);
        }, onSuccess);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: failureMessage || errorToMessage(error) };
      }
    };
    const reviewLogLine = (agent, line, direction = "sys") => {
      if (agent.id === rootAgentId) {
        rootLogLine(line, direction);
        return;
      }
      appendAgentLog(agent, line, direction);
    };
    const reviewChildren = (agent) => graphChildren(agent.id);
    const reviewWorkerTargets = (agent) => {
      const collect = (id) => graphChildren(id).flatMap((child) => child.kind === "worker" ? [child] : reviewWorkerTargets(child));
      return collect(agent.id);
    };
    const reviewFilesFor = (agent) => {
      const entryFilePath = agent.id === rootAgentId ? rootFilePath : agent.filePath;
      const project = renderProjectFor(entryFilePath);
      const files = Object.fromEntries(project.files.entries());
      if (entryFilePath !== rootFilePath) files[rootFilePath] = files[project.mainFilePath] ?? "";
      return files;
    };
    const workerBodyReady = (agent) => stripImportLines(kclFiles.get(agent.filePath) ?? "").trim().length > 0;
    const rankReworkTarget = (parent, request) => {
      const candidates = reviewWorkerTargets(parent);
      if (candidates.length === 0) return void 0;
      const targetText = request.target.toLowerCase();
      const fullText = `${request.target} ${request.instruction} ${request.reason}`.toLowerCase();
      const score = (candidate) => {
        const fields = [
          candidate.id,
          candidate.name,
          candidate.role,
          candidate.filePath,
          renderPathForFilePath(candidate.filePath)
        ].map((value2) => value2.toLowerCase());
        let value = 0;
        fields.forEach((field) => {
          if (targetText.includes(field)) value += 100;
          if (fullText.includes(field)) value += 20;
        });
        candidate.role.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 3).forEach((part) => {
          if (targetText.includes(part)) value += 30;
          else if (fullText.includes(part)) value += 5;
        });
        return value;
      };
      const ranked = candidates.map((candidate) => ({ candidate, score: score(candidate) })).sort((a, b) => b.score - a.score);
      return ranked[0];
    };
    const findReworkTarget = (parent, request, fallbackChild) => {
      const ranked = rankReworkTarget(parent, request);
      return ranked?.score ? ranked.candidate : fallbackChild;
    };
    const isPlacementRework = (request) => /\b(assembly|assemble|place|placement|position|translate|rotate|align|layout|duplicate|stray|unassembled|integrat|root)\b/i.test(`${request.target} ${request.reason} ${request.instruction}`);
    const isGeometryRework = (request) => /\b(solver|constraint|sketch|profile|hole|through-hole|cut|subtract|extrude|geometry|body|part|generate|create|empty|zero bytes|file|kcl|plate|bracket|support)\b/i.test(`${request.target} ${request.reason} ${request.instruction}`);
    const placementTargetFor = (parent) => {
      if (parent.id !== rootAgentId) return parent;
      return graphChildren(rootAgentId).find((child) => child.kind === "orchestrator");
    };
    const placementInstructionFor = (parent, changedChild, extra = "") => {
      const childImports = reviewChildren(parent).map((child) => `- ${aliasForFilePath(child.filePath)} from ${child.filePath}: ${child.role}`).join("\n");
      return [
        `Update ${parent.name}'s assembly placement layer after ${changedChild.role} changed.`,
        "Use imported child aliases, clone(), hide(), translate(), rotate(), scale(), and appearance() only.",
        "Do not create or modify part geometry. Do not use sketches, profiles, lines, circles, extrude, subtract, or boolean modeling tools.",
        "Keep each child part as a separate imported component and place the components into one coherent assembly.",
        childImports ? `Child imports:
${childImports}` : "",
        extra
      ].filter(Boolean).join("\n");
    };
    const scheduleOrchestratorPlacement = (parent, changedChild, extraInstruction = "") => {
      if (!active || parent.kind !== "orchestrator") return;
      const currentRun = runId;
      const existing = placementTimers.get(parent.id);
      if (existing !== void 0) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        placementTimers.delete(parent.id);
        if (currentRun !== runId || !agents.has(parent.id)) return;
        appendAgentLog(parent, `-> placement update after ${changedChild.role}`, "out");
        void requestAgentWork(parent, currentRun, "", 0, placementInstructionFor(parent, changedChild, extraInstruction));
      }, 1400);
      placementTimers.set(parent.id, timer);
    };
    const requestOrchestratorReview = async (parent, changedChild, currentRun) => {
      if (currentRun !== runId || !active) return;
      const children = reviewWorkerTargets(parent);
      if (children.length === 0) return;
      const pendingChildren = children.filter((child) => !workerBodyReady(child));
      if (pendingChildren.length > 0) {
        reviewLogLine(parent, `< visual review deferred: waiting on ${pendingChildren.map((child) => child.role).join(", ")}`, "in");
        return;
      }
      const reviewCount = parent.id === rootAgentId ? rootReviewRounds : parent.reviewRounds ?? 0;
      if (parent.id === rootAgentId) rootReviewRounds += 1;
      else parent.reviewRounds = reviewCount + 1;
      reviewLogLine(parent, `-> visual review ${reviewCount + 1} after ${changedChild.role} update`, "out");
      try {
        const response = await fetch("/api/zookeeper/review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: activeSessionId,
            prompt: promptInput.value.trim() || defaultPrompt,
            agent: {
              id: parent.id,
              parentId: parent.parentId,
              kind: parent.kind,
              name: parent.name,
              role: parent.role,
              instruction: parent.instruction,
              filePath: parent.id === rootAgentId ? rootFilePath : parent.filePath
            },
            child: {
              id: changedChild.id,
              name: changedChild.name,
              role: changedChild.role,
              filePath: changedChild.filePath
            },
            children: children.map((child) => ({
              id: child.id,
              name: child.name,
              role: child.role,
              filePath: child.filePath
            })),
            files: reviewFilesFor(parent)
          })
        });
        if (!response.ok) throw new Error(`review ${response.status}`);
        const review = await response.json();
        if (currentRun !== runId || !active) return;
        review.dialog?.slice(-2).forEach((line) => reviewLogLine(parent, `< review ws: ${line}`, "in"));
        reviewLogLine(parent, `< visual review: ${review.summary}`, "in");
        if (review.rework.length === 0) {
          reviewLogLine(parent, "< visual review: no child rework requested", "in");
          return;
        }
        review.rework.forEach((item) => {
          const instruction = `${item.reason ? `${item.reason}: ` : ""}${item.instruction}`;
          const rankedTarget = rankReworkTarget(parent, item);
          const hasWorkerTarget = rankedTarget !== void 0 && rankedTarget.score > 0;
          if (isPlacementRework(item) && (!hasWorkerTarget || !isGeometryRework(item))) {
            const placementTarget = placementTargetFor(parent);
            if (placementTarget === void 0) {
              reviewLogLine(parent, "< placement rework skipped; no orchestrator target");
              return;
            }
            reviewLogLine(parent, `< dispatch placement rework to ${placementTarget.name}: ${instruction}`, "in");
            scheduleOrchestratorPlacement(placementTarget, changedChild, instruction);
            return;
          }
          const target = hasWorkerTarget ? rankedTarget.candidate : findReworkTarget(parent, item, changedChild);
          reviewLogLine(parent, `< dispatch geometry rework to ${target.name}: ${instruction}`, "in");
          if (target.kind !== "worker") {
            reviewLogLine(parent, `< geometry rework skipped for non-worker target ${target.name}`);
            return;
          }
          appendAgentLog(target, `-> orchestrator rework: ${instruction}`, "out");
          void requestAgentWork(target, currentRun, "", 0, instruction);
        });
      } catch (error) {
        if (currentRun !== runId || !active) return;
        reviewLogLine(parent, `< visual review failed: ${errorToMessage(error)}`);
      }
    };
    const scheduleOrchestratorReview = (parent, changedChild) => {
      if (!active) return;
      const currentRun = runId;
      const existing = reviewTimers.get(parent.id);
      if (existing !== void 0) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        reviewTimers.delete(parent.id);
        void requestOrchestratorReview(parent, changedChild, currentRun);
      }, 1800);
      reviewTimers.set(parent.id, timer);
    };
    const refreshAncestorProjects = (agent) => {
      let parentId = agent.parentId;
      while (parentId !== "") {
        if (parentId === rootAgentId) {
          submitRootProject();
          rootLogLine(`< merged ${agent.role} into root assembly`, "in");
          const rootAgent = graphNode(rootAgentId);
          if (rootAgent !== void 0) scheduleOrchestratorReview(rootAgent, agent);
          break;
        }
        const parent = agents.get(parentId);
        if (parent === void 0) break;
        appendAgentLog(parent, `< merged child update: ${agent.role}`, "in");
        void submitAgentProject(parent);
        scheduleOrchestratorPlacement(parent, agent);
        scheduleOrchestratorReview(parent, agent);
        parentId = parent.parentId;
      }
    };
    const createAgentPanel = (agent) => {
      const panel = document.createElement("section");
      panel.classList.add("agent-card", `agent-${agent.kind}`);
      panel.style.setProperty("--agent-color", agent.color);
      const header = document.createElement("header");
      header.classList.add("agent-header");
      const title = document.createElement("div");
      title.classList.add("agent-title");
      title.textContent = agent.name;
      const role = document.createElement("div");
      role.classList.add("agent-role");
      role.textContent = agent.role;
      const status = document.createElement("div");
      status.classList.add("agent-status");
      status.textContent = agent.status;
      agent.statusElement = status;
      const titleBlock = document.createElement("div");
      titleBlock.append(title, role);
      header.append(titleBlock, status);
      const viewerSlot = document.createElement("div");
      viewerSlot.classList.add("agent-viewer-slot");
      const log = document.createElement("div");
      log.classList.add("agent-log", "websocket-log");
      agent.logElement = log;
      if (agent.kind === "worker") {
        const body = document.createElement("div");
        body.classList.add("agent-body", "worker-body");
        body.append(viewerSlot, log);
        panel.append(header, body);
      } else {
        const graph = document.createElement("div");
        graph.classList.add("agent-subgraph");
        agent.graphElement = graph;
        const body = document.createElement("div");
        body.classList.add("agent-body", "sub-orchestrator-body");
        body.append(viewerSlot, graph, log);
        panel.append(header, body);
      }
      const view = new ZooWebView({
        zooClient,
        size: paneViewerSize(),
        allowConcurrentViews: true,
        showStartLogo: false
      });
      view.el.classList.add("wall-view", "agent-view");
      agent.view = view;
      view.addEventListener("status", (ev) => {
        if (!(ev instanceof CustomEvent) || agent.logElement === void 0) return;
        writeLog(agent.logElement, `rtc: ${String(ev.detail)}`);
      });
      view.addEventListener("error", (ev) => {
        const message = ev instanceof CustomEvent ? errorToMessage(ev.detail) : "view error";
        setAgentStatus(agent, "error");
        if (agent.logElement !== void 0) writeLog(agent.logElement, `rtc error: ${message}`);
      });
      view.addEventListener("ready", (ev) => {
        const webView = ev.currentTarget;
        if (!(webView instanceof ZooWebView)) return;
        if (agent.logElement !== void 0) writeLog(agent.logElement, "modeling websocket: connected", "in");
        if (agent.logElement !== void 0) writeLog(agent.logElement, `loaded ${agent.filePath}`, "in");
        void submitAgentProject(agent, () => {
          startCameraInspection(agent);
        });
      });
      viewerSlot.appendChild(view.el);
      agent.element = panel;
    };
    const setAgentStatus = (agent, status) => {
      agent.status = status;
      if (agent.statusElement !== void 0) {
        agent.statusElement.textContent = status;
        agent.statusElement.dataset.status = status;
      }
      renderAllGraphs();
    };
    const appendAgentLog = (agent, line, direction = "sys") => {
      if (agent.logElement === void 0) return;
      writeLog(agent.logElement, line, direction);
    };
    const startAgentView = (agent) => {
      agent.view?.start();
    };
    const startCameraInspection = (agent) => {
      const webView = agent.view;
      if (webView === void 0) return;
      const agentIndex = Array.from(agents.keys()).indexOf(agent.id);
      let step = 0;
      const intervalMs = 1100 + agentIndex % 8 * 110;
      const tick = () => {
        sendInspectionCameraCommand(webView, Math.max(0, agentIndex), step);
        step += 1;
      };
      const delay = window.setTimeout(() => {
        cameraTimers.delete(delay);
        tick();
        const interval = window.setInterval(tick, intervalMs);
        cameraTimers.add(interval);
      }, 250 + agentIndex % 10 * 60);
      cameraTimers.add(delay);
    };
    const addAgent = (agent) => {
      createAgentPanel(agent);
      agents.set(agent.id, agent);
      layoutAgents();
      renderAllGraphs();
      rootLogLine(`< zookeeper.spawn ${agent.name}`, "in");
      appendAgentLog(agent, `assigned parent: ${graphNode(agent.parentId)?.name ?? "unknown"}`);
      appendAgentLog(agent, `role: ${agent.role}`);
      appendAgentLog(agent, `instruction: ${agent.instruction}`);
      appendAgentLog(agent, `file: ${agent.filePath}`);
      setAgentStatus(agent, "starting");
      startAgentView(agent);
    };
    const clearTimers = () => {
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
      for (const timer of reviewTimers.values()) window.clearTimeout(timer);
      reviewTimers.clear();
      for (const timer of placementTimers.values()) window.clearTimeout(timer);
      placementTimers.clear();
    };
    const clearCameraTimers = () => {
      for (const timer of cameraTimers) {
        window.clearTimeout(timer);
        window.clearInterval(timer);
      }
      cameraTimers.clear();
    };
    const resetAgents = () => {
      clearCameraTimers();
      agents.forEach((agent) => {
        void agent.view?.deconstructor();
        agent.element?.remove();
      });
      agents.clear();
      plannedAgentCount = 0;
      layoutAgents();
      renderAllGraphs();
    };
    const after = (ms, action) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        action();
      }, ms);
      timers.add(timer);
    };
    const startCenterView = () => {
      centerView.start();
    };
    centerView.addEventListener("status", (ev) => {
      if (!(ev instanceof CustomEvent)) return;
      centerStatus.textContent = `Center view: ${String(ev.detail)}`;
    });
    centerView.addEventListener("ready", (ev) => {
      const webView = ev.currentTarget;
      if (!(webView instanceof ZooWebView)) return;
      centerStatus.textContent = "Center assembly connected";
      submitRootProject();
    });
    const demoAgents = () => {
      const topLevelRoles = [
        "combustion sub-assembly",
        "feed system sub-assembly",
        "structure and controls",
        "nozzle and plume shaping",
        "regen cooling system",
        "thrust vector control",
        "instrumentation harness",
        "mounting and ground support"
      ];
      const nestedRoles = [
        "injector face decomposition",
        "turbopump integration",
        "cooling channel recursion",
        "nozzle extension recursion",
        "sensor package recursion",
        "mount load-path recursion"
      ];
      const workerRoles = [
        "chamber liner",
        "nozzle contour",
        "injector plate",
        "fuel valve block",
        "oxidizer valve block",
        "turbopump package",
        "thrust frame",
        "sensor harness",
        "regen cooling jacket",
        "film cooling slots",
        "igniter boss",
        "pressure transducer port",
        "gimbal ring",
        "actuator clevis",
        "mounting flange",
        "purge manifold",
        "thermal shield",
        "bell extension",
        "flex line bracket",
        "controller enclosure",
        "cable strain relief",
        "valve actuator housing",
        "interface adapter",
        "hot-fire test lug",
        "seal groove",
        "flow straightener",
        "swirl element",
        "bolt circle",
        "coolant inlet",
        "coolant outlet",
        "inspection window",
        "support strut",
        "instrument rail",
        "connector plate",
        "drain fitting",
        "assembly datum target"
      ];
      const seeds = [];
      const orchestratorIds = [];
      topLevelRoles.forEach((role, index) => {
        const id = `sub-orchestrator-${String(index + 1).padStart(4, "0")}`;
        orchestratorIds.push(id);
        seeds.push({
          id,
          parentId: rootAgentId,
          kind: "orchestrator",
          name: `Zookeeper Sub-Orchestrator ${String(index + 1).padStart(4, "0")}`,
          role,
          instruction: `Break down and coordinate the ${role} for the assembly. Merge child KCL outputs into this sub-assembly.`,
          filePath: `generated/${id}.kcl`,
          source: "fallback"
        });
      });
      nestedRoles.forEach((role, index) => {
        const id = `sub-orchestrator-${String(topLevelRoles.length + index + 1).padStart(4, "0")}`;
        orchestratorIds.push(id);
        seeds.push({
          id,
          parentId: orchestratorIds[index % topLevelRoles.length],
          kind: "orchestrator",
          name: `Zookeeper Sub-Orchestrator ${String(topLevelRoles.length + index + 1).padStart(4, "0")}`,
          role,
          instruction: `Recursively decompose ${role}. Request worker KCL for the concrete parts and maintain a renderable assembly file.`,
          filePath: `generated/${id}.kcl`,
          source: "fallback"
        });
      });
      workerRoles.forEach((role, index) => {
        const id = `worker-${String(index + 1).padStart(4, "0")}`;
        seeds.push({
          id,
          parentId: orchestratorIds[index % orchestratorIds.length],
          kind: "worker",
          name: `Zookeeper Worker ${String(index + 1).padStart(4, "0")}`,
          role,
          instruction: `Produce clean, renderable KCL for the ${role}. Keep the part simple enough to update quickly in the wall renderer.`,
          filePath: `generated/${id}.kcl`,
          source: "fallback"
        });
      });
      return seeds.slice(0, mockAgentCount);
    };
    const fallbackOrchestration = (prompt) => {
      const seeds = demoAgents();
      const files = /* @__PURE__ */ new Map();
      const topLevelFiles = seeds.filter((seed) => seed.parentId === rootAgentId).map((seed) => seed.filePath);
      files.set(rootFilePath, mainFileFor(topLevelFiles));
      seeds.forEach((seed) => {
        const childFiles = seeds.filter((child) => child.parentId === seed.id).map((child) => child.filePath);
        files.set(seed.filePath, mainFileFor(childFiles));
      });
      return {
        sessionId: `fallback-${Date.now()}`,
        source: "fallback",
        prompt,
        root: {
          instruction: `Plan and merge a renderable assembly for: ${prompt}`,
          filePath: rootFilePath
        },
        agents: seeds,
        files: objectFromMap(files),
        notes: ["OpenAI orchestration unavailable; using deterministic fallback plan."]
      };
    };
    const requestOrchestration = async (prompt) => {
      try {
        const response = await fetch("/api/orchestrate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt,
            maxAgents: mockAgentCount
          })
        });
        if (!response.ok) {
          throw new Error(`orchestrate ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        rootLogLine(`system: OpenAI orchestration unavailable; using fallback (${errorToMessage(error)})`);
        return fallbackOrchestration(prompt);
      }
    };
    const requestAgentWork = async (agent, currentRun, renderError = "", repairAttempt = 0, reviewInstruction = "", zooRetryAttempt = 0) => {
      if (currentRun !== runId || !agents.has(agent.id)) return;
      setAgentStatus(agent, "running");
      if (zooRetryAttempt > 0) {
        appendAgentLog(agent, `-> hosted Zookeeper retry ${zooRetryAttempt}/${maxZooFallbackRetries}`, "out");
      } else if (reviewInstruction.trim().length > 0) {
        appendAgentLog(agent, `-> rework iteration ${repairAttempt}: ${reviewInstruction.slice(0, 180)}`, "out");
      } else if (renderError.trim().length === 0) {
        appendAgentLog(agent, `-> ${agent.instruction}`, "out");
      } else {
        appendAgentLog(agent, `-> repair iteration ${repairAttempt}: ${renderError.slice(0, 180)}`, "out");
      }
      try {
        const response = await fetch("/api/zookeeper/work", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: activeSessionId,
            prompt: promptInput.value.trim() || defaultPrompt,
            agent: {
              id: agent.id,
              parentId: agent.parentId,
              kind: agent.kind,
              name: agent.name,
              role: agent.role,
              instruction: agent.instruction,
              filePath: agent.filePath
            },
            rootInstruction,
            files: objectFromMap(kclFiles),
            currentKcl: kclFiles.get(agent.filePath) ?? "",
            renderError,
            reviewInstruction,
            attempt: repairAttempt
          })
        });
        if (!response.ok) throw new Error(`agent work ${response.status}`);
        const update = await response.json();
        if (currentRun !== runId || !agents.has(agent.id)) return;
        if (isRetryableZooFallback(update)) {
          update.dialog?.slice(-3).forEach((line) => appendAgentLog(agent, `< ws: ${line}`, "in"));
          appendAgentLog(agent, `< hosted Zookeeper failed: ${update.summary}`, "in");
          if (zooRetryAttempt < maxZooFallbackRetries) {
            const nextRetry = zooRetryAttempt + 1;
            appendAgentLog(agent, `-> retrying hosted Zookeeper after websocket fallback (${nextRetry}/${maxZooFallbackRetries})`, "out");
            await wait(zooFallbackRetryBackoffMs * nextRetry);
            if (currentRun !== runId || !agents.has(agent.id)) return;
            await requestAgentWork(agent, currentRun, renderError, repairAttempt, reviewInstruction, nextRetry);
            return;
          }
          appendAgentLog(agent, `< fallback refused after ${maxZooFallbackRetries} retries; no KCL accepted`);
          setAgentStatus(agent, "error");
          return;
        }
        kclFiles.set(agent.filePath, update.kcl);
        if (update.dialog !== void 0 && update.dialog.length > 0) {
          update.dialog.slice(-3).forEach((line) => appendAgentLog(agent, `< ws: ${line}`, "in"));
        }
        appendAgentLog(agent, `< ${update.source === "zookeeper" ? "Zookeeper auto KCL" : "fallback KCL"}: ${update.summary}`, "in");
        appendAgentLog(agent, `< wrote ${agent.filePath}${repairAttempt === 0 ? "" : ` (repair ${repairAttempt})`}`, "in");
        setAgentStatus(agent, agent.kind === "orchestrator" ? "reviewing" : "complete");
        const renderResult = await submitAgentProject(agent);
        if (currentRun !== runId || !agents.has(agent.id)) return;
        if (!renderResult.ok) {
          const message = renderResult.message ?? "renderer rejected KCL";
          if (message.includes("view not ready") || message.includes("view not connected")) {
            appendAgentLog(agent, `< render queued until engine connects: ${message}`);
            return;
          }
          if (repairAttempt < maxAgentRepairAttempts) {
            appendAgentLog(agent, `-> renderer rejected KCL; requesting repair ${repairAttempt + 1}`, "out");
            await requestAgentWork(agent, currentRun, message, repairAttempt + 1, reviewInstruction);
          } else {
            appendAgentLog(agent, `< renderer rejected KCL after ${maxAgentRepairAttempts} repair attempts: ${message}`);
            setAgentStatus(agent, "error");
          }
          return;
        }
        refreshAncestorProjects(agent);
        if (agent.kind === "orchestrator") {
          after(900, () => {
            if (currentRun !== runId || !agents.has(agent.id) || agent.status === "error") return;
            setAgentStatus(agent, "complete");
          });
        }
      } catch (error) {
        if (currentRun !== runId || !agents.has(agent.id)) return;
        appendAgentLog(agent, `< agent update failed: ${errorToMessage(error)}`);
        setAgentStatus(agent, "error");
      }
    };
    const runZookeeper = async () => {
      if (startInProgress) return;
      startInProgress = true;
      active = true;
      runId += 1;
      const currentRun = runId;
      startButton.disabled = true;
      startButton.textContent = "Planning...";
      stopButton.disabled = false;
      clearTimers();
      resetAgents();
      rootReviewRounds = 0;
      rootLog.replaceChildren();
      const prompt = promptInput.value.trim() || defaultPrompt;
      rootLogLine("system: zookeeper orchestration opened");
      rootLogLine(`system: retrying transient hosted Zoo fallbacks up to ${maxZooFallbackRetries} times`);
      rootLogLine(`-> prompt "${prompt}"`, "out");
      const plan = await requestOrchestration(prompt);
      if (currentRun !== runId) return;
      activeSessionId = plan.sessionId;
      activeSource = plan.source;
      rootInstruction = plan.root.instruction;
      kclFiles = new Map(Object.entries(plan.files));
      rootLogLine(`< ${plan.source} plan accepted: ${plan.agents.length} sub-agents`, "in");
      plan.notes?.forEach((note) => rootLogLine(`system: ${note}`));
      renderAllGraphs();
      startCenterView();
      await wait(700);
      if (currentRun !== runId) return;
      startButton.textContent = "Spooling agents...";
      const seeds = plan.agents.slice(0, mockAgentCount);
      plannedAgentCount = seeds.length;
      layoutAgents();
      seeds.forEach((agentSeed, index) => {
        after(450 + index * 120, () => {
          if (currentRun !== runId) return;
          const color = agentColors[index % agentColors.length];
          const agent = {
            ...agentSeed,
            color,
            status: "queued"
          };
          addAgent(agent);
          if (agent.kind === "orchestrator") {
            appendAgentLog(agent, "-> decompose sub-assembly", "out");
            appendAgentLog(agent, "< child scope accepted", "in");
          } else {
            appendAgentLog(agent, "-> generate KCL candidate", "out");
            appendAgentLog(agent, "< geometry constraints received", "in");
          }
          after(900 + index * 35, () => {
            if (currentRun !== runId || !agents.has(agent.id)) return;
            if (agent.status === "error") return;
            setAgentStatus(agent, agent.kind === "orchestrator" ? "reviewing" : "running");
            appendAgentLog(agent, "< empty workspace initialized", "in");
            rootLogLine(`< ${agent.name} workspace_ready`, "in");
          });
          after(1900 + index * 90, () => {
            if (currentRun !== runId || !agents.has(agent.id)) return;
            if (agent.status === "error") return;
            if (agent.kind === "orchestrator") {
              appendAgentLog(agent, "< waiting for child KCL updates", "in");
              setAgentStatus(agent, "reviewing");
              return;
            }
            void requestAgentWork(agent, currentRun);
          });
        });
      });
      after(450 + seeds.length * 120 + 2600, () => {
        if (currentRun !== runId) return;
        rootLogLine(`< monitor split: ${seeds.length} agents mapped onto 8 border displays`, "in");
        startButton.disabled = false;
        startButton.textContent = "Running Zookeeper";
        startInProgress = false;
      });
    };
    stopButton.addEventListener("click", () => {
      runId += 1;
      active = false;
      startInProgress = false;
      clearTimers();
      resetAgents();
      rootReviewRounds = 0;
      activeSessionId = "";
      kclFiles = /* @__PURE__ */ new Map();
      void centerView.deconstructor();
      rootLogLine("system: zookeeper stopped");
      startButton.disabled = false;
      startButton.textContent = "Start Zookeeper";
      stopButton.disabled = true;
      centerStatus.textContent = "Mock websocket ready";
      renderAllGraphs();
    });
    startButton.addEventListener("click", () => {
      void runZookeeper();
    });
    stopButton.disabled = true;
    for (let index = 0; index < rows * cols; index += 1) {
      if (index === centerIndex) {
        root.appendChild(centerTile);
        continue;
      }
      const tile = document.createElement("section");
      tile.classList.add("wall-tile", "agent-monitor-tile");
      const monitor = document.createElement("div");
      monitor.classList.add("agent-monitor", "agent-monitor-empty");
      monitor.dataset.monitorIndex = String(index);
      monitorElements.set(index, monitor);
      tile.appendChild(monitor);
      root.appendChild(tile);
    }
    renderAllGraphs();
    layoutAgents();
    window.addEventListener("resize", () => {
      const size = rootViewerSize();
      centerView.el.style.width = `${size.width}px`;
      centerView.el.style.height = `${size.height}px`;
      for (const agent of agents.values()) {
        agent.view?.el.style.setProperty("width", "100%", "important");
        agent.view?.el.style.setProperty("height", "100%", "important");
      }
    });
  });
})();
