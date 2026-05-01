import test from "node:test";
import assert from "node:assert/strict";

import { normalizeCustomerChannelType } from "./queries";

test("normalizeCustomerChannelType maps facebook runtime provider to messenger DB channel type", () => {
  assert.equal(normalizeCustomerChannelType("facebook"), "messenger");
});

test("normalizeCustomerChannelType preserves supported direct channel types", () => {
  assert.equal(normalizeCustomerChannelType("line"), "line");
  assert.equal(normalizeCustomerChannelType("phone"), "phone");
  assert.equal(normalizeCustomerChannelType("email"), "email");
});

test("normalizeCustomerChannelType rejects unsupported providers clearly", () => {
  assert.throws(
    () => normalizeCustomerChannelType("instagram"),
    /Unsupported customer channel provider for persistence: instagram/
  );
});
