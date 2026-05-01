import { processCustomerMessage } from './lib/cases/case-manager';
import { ConversationMetadata } from './lib/types';

async function run() {
    let meta: ConversationMetadata = { active_flow: "general" };
    
    console.log("--- Turn 1 ---");
    const r1 = await processCustomerMessage({
        threadId: "t1", caseId: "test_c1", customerId: "u1", customerName: "Ton",
        messageText: "ที่ร้านมีแอร์ขายไหม", metadata: meta
    });
    console.log("Reply:", r1.customerReply);
    console.log("Intent:", r1.intent);
    console.log("Next Metadata:", r1.nextMetadata);
    meta = r1.nextMetadata;

    console.log("\n--- Turn 2 ---");
    const r2 = await processCustomerMessage({
        threadId: "t1", caseId: "test_c1", customerId: "u1", customerName: "Ton",
        messageText: "แอร์ 12000 บีทียู แบบติดผนัง", metadata: meta
    });
    console.log("Reply:", r2.customerReply);
    console.log("Intent:", r2.intent);
    console.log("Next Metadata:", r2.nextMetadata);
    meta = r2.nextMetadata;

    console.log("\n--- Turn 3 ---");
    const r3 = await processCustomerMessage({
        threadId: "t1", caseId: "test_c1", customerId: "u1", customerName: "Ton",
        messageText: "จะซื้อแอร์ใหม่", metadata: meta
    });
    console.log("Reply:", r3.customerReply);
    console.log("Intent:", r3.intent);
    console.log("Next Metadata:", r3.nextMetadata);
    meta = r3.nextMetadata;

    console.log("\n--- Turn 4 ---");
    const r4 = await processCustomerMessage({
        threadId: "t1", caseId: "test_c1", customerId: "u1", customerName: "Ton",
        messageText: "แนะนำด้วย", metadata: meta
    });
    console.log("Reply:", r4.customerReply);
    console.log("Intent:", r4.intent);
    console.log("Next Metadata:", r4.nextMetadata);
}

run().catch(console.error);
