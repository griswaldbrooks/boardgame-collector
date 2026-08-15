import test from "node:test";
import assert from "node:assert/strict";
import { isValidEmail, parseBatch } from "../src/parse.js";
import { JOIN_LINK, composeMessage, singleMailtoUri, batchMailtoUri } from "../src/backend.js";

test("single-email regex gates the CTA per spec", () => {
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail("alex"), false);
  assert.equal(isValidEmail("alex@"), false);
  assert.equal(isValidEmail("alex@example"), false);
  assert.equal(isValidEmail("@example.com"), false);
  assert.equal(isValidEmail("a@b.co"), true);
  assert.equal(isValidEmail("alex@example.com"), true);
});

test("batch parse: split on /[\\s,;]+/, keep tokens with '@' past position 0", () => {
  assert.deepEqual(parseBatch(""), []);
  assert.deepEqual(parseBatch("   "), []);
  assert.deepEqual(parseBatch("a@example.com"), ["a@example.com"]);
  assert.deepEqual(
    parseBatch("a@example.com b@example.com,c@example.com;d@example.com"),
    ["a@example.com", "b@example.com", "c@example.com", "d@example.com"],
  );
  // Non-email tokens drop out; newlines are just whitespace.
  assert.deepEqual(parseBatch("hello there\na@example.com"), ["a@example.com"]);
  // '@' at position 0 means no local part — dropped.
  assert.deepEqual(parseBatch("@nolocalpart.com ok@example.com"), ["ok@example.com"]);
  assert.deepEqual(parseBatch("  a@example.com , ;; "), ["a@example.com"]);
  // The parse rule does not check the domain; that is the backend's job.
  assert.deepEqual(parseBatch("a@b"), ["a@b"]);
});

test("batch parse dedupes, first occurrence wins", () => {
  assert.deepEqual(parseBatch("a@example.com a@example.com"), ["a@example.com"]);
  assert.deepEqual(
    parseBatch("b@example.com, a@example.com; b@example.com\na@example.com"),
    ["b@example.com", "a@example.com"],
  );
});

test("join-link message carries the link and the subscribe fallback", () => {
  const msg = composeMessage();
  assert.ok(msg.includes(JOIN_LINK));
  assert.ok(msg.includes("mailto:bgn-wg+subscribe@googlegroups.com"));
});

test("single mailto is addressed to the new member", () => {
  const uri = singleMailtoUri("alex@example.com");
  assert.ok(uri.startsWith("mailto:alex%40example.com?"));
  assert.ok(uri.includes(encodeURIComponent(JOIN_LINK)));
});

test("batch mailto puts every pasted address in BCC", () => {
  const uri = batchMailtoUri(["a@example.com", "b@example.com"]);
  assert.ok(uri.startsWith("mailto:?bcc="));
  assert.ok(uri.includes("a%40example.com,b%40example.com"));
  assert.ok(uri.includes(encodeURIComponent(JOIN_LINK)));
});
