
function isStandardCleaningPricing(text: string): boolean {
  const t = text.toLowerCase();

  const asksPrice =
    t.includes("เท่าไหร่") ||
    t.includes("กี่บาท") ||
    t.includes("ราคา") ||
    t.includes("ค่าล้าง") ||
    t.includes("เริ่มต้น");

  const cleaning =
    t.includes("ล้างแอร์") ||
    t.includes("แอร์สกปรก") ||
    t.includes("ล้างเครื่อง");

  const nonStandard =
    t.includes("ซ่อม") ||
    t.includes("ติดตั้ง") ||
    t.includes("ย้าย") ||
    t.includes("รื้อ") ||
    t.includes("เติมน้ำยา") ||
    t.includes("ห้องเย็น") ||
    t.includes("โรงงาน");

  return asksPrice && cleaning && !nonStandard;
}

const tests = [
    { input: "ล้างแอร์เท่าไหร่", expected: true },
    { input: "ล้างแอร์ 2 เครื่องราคาเท่าไหร่", expected: true },
    { input: "ซ่อมแอร์เท่าไหร่", expected: false },
    { input: "ทำห้องเย็นราคาเท่าไหร่", expected: false },
    { input: "ล้างแอร์โรงงานเท่าไหร่", expected: false },
    { input: "ย้ายแอร์ราคาเท่าไหร่", expected: false },
    { input: "ราคาล้างแอร์", expected: true },
];

tests.forEach(test => {
    const result = isStandardCleaningPricing(test.input);
    console.log(`Input: "${test.input}" | Expected: ${test.expected} | Result: ${result} | ${result === test.expected ? "✅" : "❌"}`);
});
