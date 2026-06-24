const { PrismaClient } = require("../src/generated/prisma");
const p = new PrismaClient();

const BATTALION_ID = "cmq0txlyn0001v0e4s3p62a8x"; // כרמלי
const ARMORY_ID = "cmq0txmk1000jv0e4v2219d6a"; // ארמון

// Categories
const CAT_RIFLES = "cmq0txp9b003jv0e4fa4pm3di"; // רובים
const CAT_MG = "cmq0txpcl003lv0e468ny2nft"; // מקלעים
const CAT_ACC = "cmq3uml6m0001l704bgeve9kv"; // נלווה לנשק
const CAT_EQUIP = "cmqdyy68w0001v0fov28rnpn8"; // ציוד

// Default status
const STATUS_OK = "cmq0txost0033v0e4cedaqumq"; // תקין

const ITEMS = [
  {
    name: 'רוס"ק M4A1 תצורת חי"ר',
    sku: "M4A1-CIR",
    categoryId: CAT_RIFLES,
    serials: [
      "915934","915936","915952","921207","922421","922705","922746","923600","924292","924677",
      "924711","924847","925808","926098","926449","926486","926628","927051","930274","930288",
      "930371","930424","930650","930667","931142","931282","931414","931563","932006","932026",
      "932084","932094","932103","932107","932156","932186","932188","932242","932252","932288",
      "932289","932293","932296","932330","932355","932359","932365","932380","932399","932437",
      "932479","932523","932529","932602","932676","932738","932759","932768","932810","932812",
      "933144","933169","933173","933220","933264","933281","933409","933612","934224","934383",
      "934867","935560","936383","936396","936522","936760","937154",
    ], // 77
  },
  {
    name: "קלע סער M4",
    sku: "M4-SAAR",
    categoryId: CAT_RIFLES,
    serials: ["345417","4238826","4260374","4261281","6214319","7137805"], // 6
  },
  {
    name: 'רוס"ק 5.56 M-16 מ"מ',
    sku: "M16-556",
    categoryId: CAT_RIFLES,
    serials: [
      // Page 4
      "329505","329590","332519","332583","332935","336072","336680","336730","337008","337590",
      "341647","341684","342432","342510","342596","343030","344042","344085","344089","400033",
      "400041","400044","400157","400372","400460","400813","401313","401410","402094","402108",
      "402467","403891","404750","404868","405037","405455","405646","405767","406810","406906",
      "407371",
      // Page 5
      "407398","407468","407509","857531","1148439","1885452","1916604","1919153","1955734","1968772",
      "1974008","1989330","1993578","2037723","2046180","2218563","2221530","3283271","3295654","3321109",
      "3394243","3395663","3400069","3408488","3408570","3411175","3413281","3415957","3452295","4206009",
      "4208718","4305169","4335725","4336861","4341856","4374879","4390093","4412536","4426153","4501919",
      "4525152","4532810",
      // Page 6
      "4537308","4549962","4567671","4578068","4616228","4628631","4647067","4655945","4773227","4798487",
      "4941573","4974250","4974389","4977170","4981087","4981339","4982147","4982265","4982613","5010123",
      "5010270","5011488","5013453","5015984","5016273","5017667","5018480","5021580","5022260","5030506",
      "5035361","5035627","5037140","5037192","5037307","5038124","5039166","5040218","5041204","5042673",
      "5046624","5049960",
      // Page 7
      "5050924","5051294","5051587","5051676","5052440","5060566","5066916","5067637","5070176","5070567",
      "5071220","5071586","5075751","5077817","5078762","5080906","5086358","5089804","5092936","5094930",
      "5110182","5118997","5122640","5123142","5124522","5124676","5131554","5139686","5142442","5142786",
      "5143337","5143954","5144831","5147944","5149635","5153838","5161693","5164459","5164993","5166387",
      "5168468","5170279",
      // Page 8
      "5170624","5171132","5171710","5171940","5173385","5174431","5174521","5175325","5176490","5178907",
      "5179900","5181359","5182157","5185887","5188887","5192511","5193446","5200625","5233803","5237926",
      "5243086","5254859","5262441","5263167","5264785","5264923","5265785","5270159","5270453","5427129",
      "8863048","9125864","9130545","9139056","9160878","9164454","9165226","9166636","9174006","9175154",
      "9178123","9178646",
      // Page 9
      "9179307","9182666","9184595","9189737","9189811","9203258","9209029","9209441","9220678","9229308",
      "9247763","9248091","9252158","9260455","9260566","9263413","9263755","9266630","9267863","9268585",
      "9272249","9303359","9307179","9401236","9402037","9406873","9406912","9407193","9407209","9407224",
      "9407269","9407409","9407524","9407626","9407653","9407706","9408799","9408815","9409228","9410035",
      "9410282","9410575",
      // Page 10
      "9410753","9411066","9411097","9411160","9411284","9411292","9412030","9412369","9412420","9412446",
      "9412805","9412932","9412962","9413409","9413472","9413870","9414075","9442459","9443866","9444198",
      "9448157","9449569","9450565","9452102","9596943","9599478",
    ], // 277
  },
  {
    name: 'מקלע אחיד 7.62 ממ מאג חי"ר',
    sku: "MAG-762",
    categoryId: CAT_MG,
    serials: [
      "112","2200499","6500558","6601904","6602224","6700219","6701372","6701475",
      "6701546","7000044","7000258","7202017","7202322","7202864",
    ], // 14
  },
  {
    name: "מקלע קל נגב דגם ב'",
    sku: "NEGEV-B",
    categoryId: CAT_MG,
    serials: ["32601363","32601482","98500416","98500574"], // 4
  },
  {
    name: "מטול רימונים M-203",
    sku: "M203",
    categoryId: CAT_ACC,
    serials: ["97318","99779","100316","105168"], // 4
  },
  {
    name: 'אמר"ל לנהג"-עדי" כולל זווד',
    sku: "NV-ADI",
    categoryId: CAT_ACC,
    serials: ["10070323"], // 1
  },
  {
    name: "אמר\"ל שפנפן חד-עיני כולל זווד",
    sku: "NV-SHPAN",
    categoryId: CAT_ACC,
    serials: ["5042116","5042190","6082878"], // 3
  },
  {
    name: 'וילון נהג לנגמ"ש',
    sku: "VILON-APC",
    categoryId: CAT_EQUIP,
    serials: [
      "486","30538","474287","483650","85030107","85050257","85050294",
      "85070565","85121291","86040683","86040896","86051013","86071294",
    ], // 13
  },
  {
    name: 'אמר"ל חד עיני; שח"מ',
    sku: "NV-SHAHM",
    categoryId: CAT_ACC,
    serials: ["45400025"], // 1
  },
  {
    name: "אמר\"ל דו-עיני; נועה",
    sku: "NV-NOA",
    categoryId: CAT_ACC,
    serials: ["11020730","11020731","11020739","11020740","11020744"], // 5
  },
  {
    name: 'אמר"ל חד עיני שח"מ; שפ\' ירוקה',
    sku: "NV-SHAHM-G",
    categoryId: CAT_ACC,
    serials: [
      "74309451","74322709","74322720","74323246","74326497","74326502",
      "74326516","74326523","74326526","74326767","74326773","74329742","74329815",
    ], // 13
  },
  {
    name: "אמר\"ל דו-עיני; עידו דור ב' (קל משקל)",
    sku: "NV-IDO-B",
    categoryId: CAT_ACC,
    serials: ["77624","78518","79272","79273","79281","79282"], // 6
  },
  {
    name: "אמר\"ל דו עיני; MIKRON-D",
    sku: "NV-MIKRON",
    categoryId: CAT_ACC,
    serials: ["231435","231442","231446","231454","232192","232206","232209"], // 7
  },
  {
    name: 'אמר"ל אקילה 4* כולל זווד',
    sku: "NV-AQUILA",
    categoryId: CAT_ACC,
    serials: ["4199","1115698","97071150","98052209","98052608","98062699"], // 6
  },
  // Items from page 1 summary WITHOUT serial numbers in this PDF
  { name: "כוונת השלכה M21 מתאם פיקטיני", sku: "SIGHT-M21-PIC", categoryId: CAT_ACC, qty: 27 },
  { name: "כוונת השלכה M21 ידית נשיאה M16", sku: "SIGHT-M21-M16", categoryId: CAT_ACC, qty: 6 },
  { name: "משקפת 10*40 סברובסקי", sku: "BINO-SWAR", categoryId: CAT_ACC, qty: 9 },
  { name: "משקפת 10X50 RAZOR", sku: "BINO-RAZOR", categoryId: CAT_ACC, qty: 3 },
  { name: "טלסקופ יום טריג'יקון X4 לקלע סער", sku: "SCOPE-TRIJ-X4", categoryId: CAT_ACC, qty: 5 },
  { name: "כוונת אופטית טריג'יקון; בק' אדומה X4 PRO", sku: "SCOPE-TRIJ-PRO", categoryId: CAT_ACC, qty: 1 },
  { name: "כוונת השלכה מטול M203-רוסר M4", sku: "SIGHT-M203", categoryId: CAT_ACC, qty: 4 },
  { name: "כוונת השלכה מתקדמת M5", sku: "SIGHT-M5", categoryId: CAT_ACC, qty: 46 },
  { name: "סמן לייזר AIM1-LR", sku: "LASER-AIM1", categoryId: CAT_ACC, qty: 4 },
  { name: "סמן אוניברסלי; לייזר טאצ", sku: "LASER-TATZ", categoryId: CAT_ACC, qty: 16 },
  { name: "סמן לייזר איוטק; OGL", sku: "LASER-OGL", categoryId: CAT_ACC, qty: 10 },
];

(async () => {
  try {
    // 1. Delete existing placeholder serials in armory (fake serial numbers)
    const existing = await p.serialUnit.findMany({
      where: { currentHolderId: ARMORY_ID },
      select: { id: true, serialNumber: true },
    });
    const placeholders = existing.filter(
      (u) => /^(M4-|NEGEV-|LAW-|AMR-)/.test(u.serialNumber) || u.serialNumber === "225"
    );
    if (placeholders.length > 0) {
      await p.serialUnit.deleteMany({ where: { id: { in: placeholders.map((u) => u.id) } } });
      console.log(`Deleted ${placeholders.length} placeholder serials`);
    }

    let totalCreatedTypes = 0;
    let totalCreatedSerials = 0;

    for (const item of ITEMS) {
      // 2. Create or find ItemType
      let itemType = await p.itemType.findFirst({
        where: { battalionId: BATTALION_ID, sku: item.sku },
      });
      if (!itemType) {
        itemType = await p.itemType.create({
          data: {
            name: item.name,
            sku: item.sku,
            trackingMethod: "SERIAL",
            isSensitive: true,
            battalionId: BATTALION_ID,
            categoryId: item.categoryId,
          },
        });
        totalCreatedTypes++;
        console.log(`Created ItemType: ${item.name} (${item.sku})`);
      } else {
        console.log(`Exists ItemType: ${item.name} (${item.sku})`);
      }

      // 3. Create SerialUnits
      if (item.serials && item.serials.length > 0) {
        let created = 0;
        let skipped = 0;
        for (const sn of item.serials) {
          const exists = await p.serialUnit.findFirst({
            where: { serialNumber: sn, itemTypeId: itemType.id },
          });
          if (!exists) {
            await p.serialUnit.create({
              data: {
                serialNumber: sn,
                itemTypeId: itemType.id,
                statusId: STATUS_OK,
                currentHolderId: ARMORY_ID,
                battalionId: BATTALION_ID,
              },
            });
            created++;
          } else {
            skipped++;
          }
        }
        totalCreatedSerials += created;
        console.log(`  → ${created} serials created, ${skipped} skipped (${item.serials.length} total)`);
      } else if (item.qty) {
        console.log(`  → ${item.qty} items (no serial numbers in PDF — type only)`);
      }
    }

    // Final count
    const finalCount = await p.serialUnit.count({ where: { currentHolderId: ARMORY_ID } });
    console.log(`\n=== DONE ===`);
    console.log(`Created ${totalCreatedTypes} new item types`);
    console.log(`Created ${totalCreatedSerials} serial units`);
    console.log(`Total serials in armory now: ${finalCount}`);
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await p.$disconnect();
  }
})();
