import { createKnowledgeDoc } from "../lib/db/queries";

const data = [
  {
    "id": "QA_001",
    "category": "Buying",
    "question": "วิธีคำนวณ BTU แอร์ที่เหมาะสมกับขนาดห้องต้องทำอย่างไร?",
    "answer": "สำหรับห้องปกติให้ใช้สูตร (กว้าง x ยาว) x 800 แต่หากเป็นห้องที่โดนแดดจัดให้คูณด้วย 1,000 แทนครับ เมื่อได้ค่าแล้วควรเลือกขนาด BTU ที่ปัดขึ้นเล็กน้อยเพื่อให้แอร์ไม่ทำงานหนักจนเกินไปครับ",
    "metadata": {
      "source": "Sanook/Yellow Tech",
      "tags": ["hvac_calc", "btu_selection"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_002",
    "category": "Buying",
    "question": "แอร์ระบบ Inverter ต่างจากแอร์ระบบธรรมดาอย่างไรในแง่การประหยัดไฟ?",
    "answer": "ระบบ Inverter จะปรับรอบการทำงานของคอมเพรสเซอร์ให้ต่อเนื่องตามอุณหภูมิจริง ทำให้กินไฟน้อยกว่าและทำงานเงียบกว่าระบบธรรมดาครับ ส่วนแอร์ธรรมดาจะใช้วิธีตัด-ต่อการทำงานเต็มกำลังทำให้สิ้นเปลืองพลังงานมากกว่าครับ",
    "metadata": {
      "source": "Sinthanee",
      "tags": ["inverter_tech", "energy_efficiency"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_003",
    "category": "Buying",
    "question": "ค่า SEER คืออะไร และในปี 2026 ควรเลือกที่ระดับเท่าไหร่?",
    "answer": "SEER คือค่าประสิทธิภาพการประหยัดไฟตามฤดูกาล ยิ่งค่าสูงยิ่งประหยัดไฟได้มากขึ้นครับ สำหรับปี 2026 แนะนำให้เลือกแอร์ที่มีค่า SEER ตั้งแต่ 20.0 ขึ้นไปเพื่อความคุ้มค่าในระยะยาวครับ",
    "metadata": {
      "source": "Carrier/TrueID",
      "tags": ["seer_rating", "efficiency_2026"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_004",
    "category": "Buying",
    "question": "แอร์รุ่นท็อปปี 2025-2026 มีรุ่นไหนที่โดดเด่นและน่าสนใจบ้าง?",
    "answer": "รุ่นที่แนะนำคือ Mitsubishi XZ Series ที่มีเซนเซอร์ 3D i-see และ Daikin AIR CREATOR ที่เน้นอากาศบริสุทธิ์ครับ นอกจากนี้ยังมี Samsung AI WindFree ที่มีโหมด AI Energy ช่วยประหยัดไฟได้สูงสุดถึง 70% ครับ",
    "metadata": {
      "source": "TrueID/Yellow Tech",
      "tags": ["spec_models_2026", "ai_features"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_005",
    "category": "Buying",
    "question": "หากสมาชิกในบ้านเป็นภูมิแพ้ควรเลือกแอร์ที่มีเทคโนโลยีแบบไหน?",
    "answer": "แนะนำเทคโนโลยี Active Streamer ของ Daikin หรือ nanoe™ X ของ Panasonic ที่ช่วยยับยั้งเชื้อโรคและสารก่อภูมิแพ้ได้ตลอด 24 ชั่วโมงครับ ระบบเหล่านี้จะช่วยให้อากาศในห้องสะอาดและปลอดภัยต่อสุขภาพมากขึ้นครับ",
    "metadata": {
      "source": "Yellow Tech/TrueID",
      "tags": ["health_tech", "air_purification"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_006",
    "category": "Buying",
    "question": "เทคโนโลยี WindFree ในแอร์ Samsung มีข้อดีอย่างไร?",
    "answer": "ช่วยกระจายความเย็นผ่านรูขนาดเล็กนับหมื่นรู ทำให้เย็นฉ่ำสม่ำเสมอโดยไม่มีลมแรงประทะตัวโดยตรงครับ นอกจากนี้ยังมีระบบ AI Energy Mode ที่ช่วยวิเคราะห์พฤติกรรมผู้ใช้เพื่อการประหยัดพลังงานสูงสุดครับ",
    "metadata": {
      "source": "Samsung/TrueID",
      "tags": ["windfree_tech", "ai_energy_mode"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_007",
    "category": "Buying",
    "question": "เทคโนโลยี Dual Barrier Coating ในแอร์ Mitsubishi ช่วยเรื่องอะไร?",
    "answer": "เป็นการเคลือบสารพิเศษภายในตัวเครื่องเพื่อลดการจับตัวของฝุ่นและคราบน้ำมันครับ ช่วยให้เครื่องสะอาดทำงานได้เต็มประสิทธิภาพยาวนานและรักษาการประหยัดไฟให้สม่ำเสมอครับ",
    "metadata": {
      "source": "Mitsubishi/Yellow Tech",
      "tags": ["coating_tech", "dust_protection"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_008",
    "category": "Troubleshooting",
    "question": "สาเหตุหลักที่ทำให้น้ำแอร์หยดเกิดจากอะไร?",
    "answer": "มักเกิดจากแผ่นกรองฝุ่นอุดตันจนเกิดน้ำแข็งละลาย หรือท่อน้ำทิ้งอุดตันจากสิ่งสกปรกและตะไคร้น้ำครับ นอกจากนี้อาจเกิดจากถาดรองน้ำทิ้งชำรุดหรือการติดตั้งที่ไม่ได้ระดับมาตรฐานครับ",
    "metadata": {
      "source": "Carrier/Beko",
      "tags": ["troubleshoot_leak", "maintenance_cause"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_009",
    "category": "Troubleshooting",
    "question": "หากน้ำแอร์หยด ยังสามารถเปิดใช้งานต่อไปได้หรือไม่?",
    "answer": "ไม่แนะนำให้เปิดใช้งานต่อครับ เพราะน้ำที่หยดอาจไหลไปโดนอุปกรณ์ไฟฟ้าข้างเคียงจนเกิดไฟฟ้าช็อตหรือทำให้แอร์เสียหายรุนแรงได้ ควรปิดเครื่องและรีบแจ้งช่างตรวจสอบทันทีครับ",
    "metadata": {
      "source": "Carrier",
      "tags": ["safety_warning", "leak_danger"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_010",
    "category": "Troubleshooting",
    "question": "อาการของคาปาซิเตอร์ (Capacitor) เสื่อมหรือเสียสังเกตได้อย่างไร?",
    "answer": "สังเกตได้จากคอมเพรสเซอร์ไม่ทำงานแต่มีเสียงฮัมผิดปกติ หรือพัดลมหมุนช้ากว่าปกติครับ บางกรณีอาจพบตัวคาปาซิเตอร์มีอาการบวมหรือมีคราบน้ำมันรั่วไหลออกมาด้วยครับ",
    "metadata": {
      "source": "PKT Shop",
      "tags": ["capacitor_failure", "compressor_issue"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_011",
    "category": "Troubleshooting",
    "question": "จะสังเกตได้อย่างไรว่าน้ำยาแอร์ในระบบเหลือน้อยหรือรั่ว?",
    "answer": "สังเกตได้จากแอร์ไม่เย็น และลมที่พัดออกมาจากพัดลมคอยล์ร้อนนอกห้องเป็นลมธรรมดาที่ไม่มีความร้อนสะสมครับ หากพบอาการนี้ให้รีบแจ้งช่างมาตรวจสอบจุดรั่วและเติมน้ำยาให้ได้ระดับครับ",
    "metadata": {
      "source": "Carrier",
      "tags": ["refrigerant_leak", "outdoor_unit_check"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_012",
    "category": "Troubleshooting",
    "question": "การล้างแอร์เบื้องต้นด้วยตัวเองต้องเตรียมตัวอย่างไร?",
    "answer": "เริ่มจากการสับเบรกเกอร์ลงเพื่อความปลอดภัย แล้วถอดแผ่นกรอง (Filter) มาล้างด้วยน้ำเปล่าให้สะอาดครับ จากนั้นผึ่งให้แห้งสนิทก่อนประกอบกลับ และสามารถใช้สเปรย์ล้างแอร์ช่วยทำความสะอาดคอยล์เย็นเพิ่มเติมได้ครับ",
    "metadata": {
      "source": "Beko/Shopee",
      "tags": ["diy_cleaning", "filter_maintenance"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_013",
    "category": "Troubleshooting",
    "question": "หากท่อน้ำทิ้งอุดตันมีวิธีแก้ไขเบื้องต้นอย่างไร?",
    "answer": "สามารถใช้เครื่องเป่าลมไฟฟ้าเป่าบริเวณท่อที่อุดตันออกไปได้ครับ แต่หากมีสิ่งสกปรกสะสมมากแนะนำให้เรียกช่างมาฉีดล้างด้วยปั๊มน้ำแรงดันสูงเพื่อให้ท่อสะอาดหมดจดครับ",
    "metadata": {
      "source": "Carrier",
      "tags": ["drain_blockage", "cleaning_tips"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_014",
    "category": "Troubleshooting",
    "question": "การเปิด-ปิดแอร์บ่อยเกินไปส่งผลเสียต่อเครื่องอย่างไร?",
    "answer": "จะทำให้คาปาซิเตอร์ต้องทำงานเริ่มต้นบ่อยครั้ง ซึ่งอาจทำให้เสื่อมสภาพเร็วกว่าปกติครับ แนะนำให้ตั้งอุณหภูมิที่เหมาะสมเพื่อให้ระบบทำงานได้อย่างสมดุลและประหยัดไฟครับ",
    "metadata": {
      "source": "PKT Shop",
      "tags": ["capacitor_wear", "usage_tips"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_015",
    "category": "Troubleshooting",
    "question": "ทำไมควรล้างแอร์เป็นประจำทุก 6 เดือน?",
    "answer": "เพื่อขจัดฝุ่นที่ขัดขวางการระบายความร้อน ช่วยให้แอร์ทำงานเต็มประสิทธิภาพและประหยัดค่าไฟได้จริงครับ นอกจากนี้ยังช่วยลดการสะสมของเชื้อราและแบคทีเรียเพื่อสุขภาพของผู้อยู่อาศัยครับ",
    "metadata": {
      "source": "OfficeMate/Beko",
      "tags": ["periodic_maintenance", "health_benefit"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_016",
    "category": "Service",
    "question": "รายละเอียดโครงการ 'ล้างแอร์ช่วยชาติ 2569' มีอะไรบ้าง?",
    "answer": "รัฐให้ส่วนลดค่าล้างแอร์ 300 บาทต่อเครื่อง จำนวน 30,000 สิทธิ์ทั่วประเทศครับ โดยเปิดลงทะเบียนตั้งแต่วันที่ 25 มีนาคม 2569 เวลา 11.00 น. เป็นต้นไปจนกว่าสิทธิ์จะเต็มครับ",
    "metadata": {
      "source": "OfficeMate",
      "tags": ["gov_project_2569", "discount_300"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_017",
    "category": "Service",
    "question": "เงื่อนไขการรับสิทธิ์ล้างแอร์ช่วยชาติ 2569 มีอะไรบ้าง?",
    "answer": "ต้องเป็นแอร์ประเภทติดผนังขนาดไม่เกิน 24,000 BTU โดยจำกัด 1 หมายเลขบัตรประชาชนต่อ 1 หมายเลขผู้ใช้ไฟฟ้าครับ ผู้ใช้สิทธิ์ต้องเตรียมบิลค่าไฟปี 2569 เพื่อใช้ลงทะเบียนครับ",
    "metadata": {
      "source": "OfficeMate",
      "tags": ["gov_subsidy_terms", "wall_type_only"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_018",
    "category": "Service",
    "question": "การล้างแอร์ช่วยลดค่าไฟได้มากน้อยแค่ไหน?",
    "answer": "แอร์ที่สะอาดจะระบายความร้อนได้ดีขึ้น ทำให้คอมเพรสเซอร์ไม่ต้องทำงานหนักจนเกินไป ช่วยลดการใช้พลังงานและลดค่าไฟได้จริงในทุกรอบบิลครับ",
    "metadata": {
      "source": "OfficeMate/Sinthanee",
      "tags": ["energy_saving", "cost_reduction"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_019",
    "category": "Service",
    "question": "บริการของร้าน Yellow Tech ครอบคลุมพื้นที่ใดและมีการรับประกันอย่างไร?",
    "answer": "เราให้บริการในเขตจังหวัดนครศรีธรรมราชและทั่วภาคใต้ โดยทีมช่างประสบการณ์กว่า 10 ปีครับ ทางร้านมีการรับประกันงานซ่อมสูงสุดถึง 60 วัน เพื่อให้ลูกค้ามั่นใจในคุณภาพครับ",
    "metadata": {
      "source": "Yellow Tech",
      "tags": ["service_area_south", "warranty_60_days"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  },
  {
    "id": "QA_020",
    "category": "Service",
    "question": "น้ำยาล้างแอร์แบบโฟมและสเปรย์มีข้อดีอย่างไร?",
    "answer": "ช่วยขจัดคราบฝุ่นและลดกลิ่นอับในคอยล์เย็นได้ดี โดยมีข้อดีคือสามารถทำความสะอาดได้ง่ายโดยไม่ต้องใช้น้ำปริมาณมากครับ เหมาะสำหรับการดูแลรักษาแอร์ด้วยตัวเองในเบื้องต้นครับ",
    "metadata": {
      "source": "Shopee/Nin ST",
      "tags": ["cleaning_agents", "water_saving_clean"],
      "language": "th",
      "relevance_score_placeholder": 0.0
    }
  }
];

async function run() {
  console.log(`Starting import of ${data.length} items...`);
  let successCount = 0;
  for (const item of data) {
    try {
      const payload: any = {
        title: item.question,
        category: item.category,
        content: `ถาม: ${item.question}\n\nตอบ: ${item.answer}`,
        tags: item.metadata.tags,
        status: "published" as const,
      };
      await createKnowledgeDoc(payload);
      successCount++;
      console.log(`Imported: ${item.id}`);
    } catch (error) {
      console.error(`Failed to import ${item.id}:`, error);
    }
  }
  console.log(`Done! Imported ${successCount} out of ${data.length} items.`);
}

run().catch(console.error);
