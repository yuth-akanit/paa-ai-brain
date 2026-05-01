import { processCustomerMessage } from './lib/cases/case-manager';
import { ConversationMetadata } from './lib/types';

async function run() {
    let failCount = 0;
    for (let i = 1; i <= 10; i++) {
        let meta: ConversationMetadata = { active_flow: "general" };
        const r1 = await processCustomerMessage({
            threadId: `t${i}`, caseId: `test_c${i}`, customerId: "u1", customerName: "Ton",
            messageText: "ที่ร้านมีแอร์ขายไหม", metadata: meta
        });
        if (!r1.customerReply.includes("จำหน่ายแอร์")) {
            console.error(`FAIL at iteration ${i}! Reply: ${r1.customerReply}`);
            failCount++;
        }
    }
    if (failCount === 0) {
        console.log("PASS: 10/10 exact responses.");
    }
}

run().catch(console.error);
