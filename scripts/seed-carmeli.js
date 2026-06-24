const { PrismaClient } = require('../src/generated/prisma');
const p = new PrismaClient();

const BID = 'cmq0txlyn0001v0e4s3p62a8x';
const CO = {
  T: 'cmq0txn5i0017v0e488j3i7mh',  // טנא
  P: 'cmq0txn93001bv0e488ai6qng',  // פתן
  S: 'cmq0txn240013v0e476n033cs',  // שינוע
  M: 'cmq0txmtu000vv0e4mt3scxci',  // מפקדה/אגם
  H: 'cmq0txmys000zv0e4kpd4e6ms',  // פלהק
};

// [personalNumber, firstName, lastName, companyCode]
const soldiers = [
  // PAGE 1 (52)
  [8860211,'לירן','מושייב','T'],
  [7014103,'יאיר יוסף','סולו','P'],
  [8111409,'ליאון אלחנן משה','רוזנשטיין','P'],
  [7219727,'גיא','גביש','M'],
  [8898677,'דור חיים','ברובנדר','M'],
  [5239955,'חנ-אל','קרואני','T'],
  [7150161,'חיים','קריספין','P'],
  [6867437,'אסף','יהודה','S'],
  [8743713,'ניצן','אסרף','M'],
  [8576887,'יובל-ציון','גולן','T'],
  [5733933,'אלכסי','צורנינקי','M'],
  [3126223,'יהודה','סרוסי','M'],
  [6056347,'וליד','ולי','M'],
  [8288202,'מעיין','כהן-שור','M'],
  [9046735,'גסטינה','זילברמן','T'],
  [8855997,'אליאב','הררי','S'],
  [6982726,'ליאור','גור','M'],
  [8361465,'נועה','חץ','T'],
  [9084109,'אילה','אגרונוב','M'],
  [6075146,'אוהד','ירון','M'],
  [9172238,'מריה','מטלסקי','M'],
  [5177562,'בן ציון','מושקוביץ','S'],
  [9170349,'בוריס','מוסקביץ','M'],
  [5647207,'רומן','גולדמן','P'],
  [8524798,'עילי','פרדיאן','M'],
  [7117338,'יגאל יעקוב','מוק','M'],
  [8080105,'בר','עמרן','T'],
  [9037663,'איתי אבי','גור','M'],
  [8864596,'קורל','איבן','M'],
  [9240476,'יהב','אוחיון','M'],
  [8394240,'עמית','עזרן','M'],
  [6123095,'נאור','גימאני','P'],
  [5699818,'ארז','מכלוף','S'],
  [8392585,'גל','כהן','M'],
  [9947015,'קטרינה','גולדנבלט','T'],
  [9083699,'עמית','בנאסולי','M'],
  [8591232,'אסף שלמה','בן חמו','M'],
  [7494109,'אבגר','שחף','M'],
  [9048638,'טוואצאו','אלמו','M'],
  [8762480,'יואל יצחק','פרנק','M'],
  [9156340,'ניקול','דרוסט','T'],
  [9034406,'יאיר','אשר','T'],
  [7368600,'יצחק','אפרמיאן','S'],
  [9107685,'אדיר','אהרוני','M'],
  [9126861,'יובל','פיינבוך','T'],
  [8839241,'נטלי זהבה','פרימט','M'],
  [7726776,'אנדריי','פטרוב','T'],
  [9050247,'שליו','כריסטיאן','M'],
  [7087046,'אהוד','אדלר','P'],
  [7111076,'שמעון','הילמן','M'],
  [8877672,'ניקיטה','ורשבסקי','T'],
  [8857845,'יהב דוד','לוי','T'],

  // PAGE 2 (55)
  [8857899,'רותם','דאר','S'],
  [9120494,'לביא','רייס','M'],
  [9097695,'יונתן טוביה','הורביץ','M'],
  [8823391,'שמעון','דהן','S'],
  [6915801,'יצחק','טהויליאן','T'],
  [8165829,'עדן','מלון','M'],
  [5402807,'שי משה','בוזרנו','T'],
  [6860139,'אלדד אלי','רחמים','M'],
  [7076091,'דב איתן','מושקוביץ','M'],
  [9147683,'אריאל','אזן','M'],
  [7190442,'אליעזר אסף','רוזנברג','S'],
  [7036992,'אבי','בר אור','M'],
  [5239820,'חנן','אמזלג','M'],
  [8786145,'גונן','סרבגילי','M'],
  [5968049,'יונתן','איתן','M'],
  [5306779,'ניר','יבל','P'],
  [9131314,'דניאל','בבייב','S'],
  [7649291,'עומר','הולנדר','P'],
  [9000779,'גילי','אבדאייב','S'],
  [8559072,'מוי חנה','גראסי','S'],
  [7594592,'פולינה','שפירא','T'],
  [8322826,'מרקוס אברהם','גראסי','S'],
  [9072772,'ליה','גירון','T'],
  [9114877,'שיר','גאמס','M'],
  [9140942,'ירדן','קרקש','M'],
  [8877221,'אריאל','רחמים','M'],
  [5978081,'יהודה אריה','לוי','S'],
  [8819989,'נהוראי','ביטון','T'],
  [7663332,'עידן','בוחניק','M'],
  [5153422,'דניאל','גדסי','P'],
  [5177797,'רמי','יושאייב','S'],
  [9380048,'שי','חי','M'],
  [8507075,'יצחק','מוצה','P'],
  [8786228,'מתן','כראדי','T'],
  [9024749,'מיכל','מלול','M'],
  [8751101,'עמית','רוח','M'],
  [8843118,'עדן','כהן','T'],
  [9063642,'ליאה','פלטני','T'],
  [5896129,'נתאי','אברהם','M'],
  [8607768,'אייצאו','דמקה','T'],
  [8814652,'דניאל','יופה','T'],
  [7101878,'ישי','עוזרי','M'],
  [5811041,'דן','רכס','P'],
  [7184324,'אלי','נחמיקה','S'],
  [7490520,'דוד שמעון','שטרית','M'],
  [8834719,'מנדפרו','באייר','M'],
  [8621557,'דפנה','יוסף','M'],
  [9266707,'כפיר','אלביליה','M'],
  [8851572,'נתנאל פנחס','שושני','M'],
  [8453852,'מאי','אוחנה','S'],
  [9232373,'אדר','צדיק','M'],
  [9127083,'איל מרדכי','שמעוני','M'],
  [5297488,'יעקב','גקסון','P'],
  [9124463,'סוף','טלר','M'],
  [9099617,'ירין','מנשה','M'],

  // PAGE 3 (53, excluding טרפ עמית and בן גויה ממן נופר)
  [5207612,'ערן','מאיר','M'],
  [9074287,'בר','מויאל','M'],
  [8109637,'יוני יונתן','דהן חכשורי','M'],
  [8437880,'שי','בלסיאנו','S'],
  [7324910,'יותם','שבתאי','S'],
  [8727386,'לירון','ויזמן','M'],
  [6630573,'עידן','עזר','M'],
  [9094785,'דניאל יוסף','בן יקר','M'],
  [5301157,'ליר שלומי','עייש מויאל','T'],
  [7092677,'דוד','בלוך','P'],
  [5301332,'איתמר יצחק','דיטש','M'],
  [7408820,'יהונתן','ותרי','M'],
  [7300039,'מיכאל שמעון','תורגמן','P'],
  [9127216,'נועה','אברהם','T'],
  [7680784,'וליד','סעב','S'],
  [8676348,'דור','כדורי','T'],
  [9148316,'יונתן אברהם','אמויאל','M'],
  [9174184,'אלכסיי','בוזס','P'],
  [7728658,'וודאג','דראש','S'],
  [6193434,'גנאדי','גינסקי','T'],
  [7554496,'אביחי פנחס','מיכליס','M'],
  [9019354,'אברהם','בן זכאי','M'],
  [7603287,'עדיאל','קליין','M'],
  [5883121,'אורי','פלדמן','M'],
  [8048106,'יניב','אברהמי','M'],
  [7526003,'תומר','שלוסר','M'],
  [8716492,'מתניה אברהם','טרבלסי','T'],
  [8788688,'נועם','גרינבאום','M'],
  [7340317,'אסף דוד','אסולין שיש','P'],
  [8855004,'ניצן','ביטון','M'],
  [7273874,'לביא','יצחקי','M'],
  [9450309,'אילה','לכצר','T'],
  [8894472,'דניאלה','אקילוב','M'],
  [5397714,'אביחי בניהו','יום טוב','P'],
  [9399545,'אורי יצחק','שניאור','M'],
  [7590834,'אביאל','סלמון','M'],
  [9035189,'בת אל','קבדה','T'],
  [8645134,'גיא שאול','אטלן','P'],
  [9000539,'רוני','אלקיים','M'],
  [5858892,'רפאל מאיר אברהם','ישראלי','P'],
  [7359348,'אריאל אברהם','ורשנר','T'],
  [8138237,'קובי','כהן','M'],
  [8852458,'יוסף','איציק','T'],
  [5965049,'שלמה','חדאד','P'],
  [5351936,'יהודה אברהם','אלמלם','T'],
  [8414882,'מנחם מנדל','אופן','M'],
  [8173341,'אוראל מאיר','דדון','S'],
  [9017642,'לירן מרסל','עלוש','T'],
  [9109121,'נדב','כשר','M'],
  [8711891,'נריה','אלחרר','T'],
  [8704819,'רואי יגאל','כהן','T'],
  [7170782,'יצחק','יפרח','S'],
  [5230571,'פטר','אנגל','T'],

  // PAGE 4 (11)
  [9238878,'קורן','קסוס','T'],
  [9335545,'תומר','בש','M'],
  [9153448,'לידור','דוד','M'],
  [8158568,'עומרי','חייט','M'],
  [8121375,'לינוי','סקירא אריס','M'],
  [9084823,'ניקול','ליוביץ','T'],
  [8098792,'רותם','בלוך','M'],
  [9308978,'אנדריי','זנצקין','T'],
  [6905919,'ישי','יהודאי','M'],
  [8149130,'דן ישראל','בן פרש','S'],
  [8145147,'חן','שטרקמן','M'],
];

// Known existing soldiers that need PN updates (old PN -> name match)
const knownUpdates = {
  '1943': 7111076,   // הילמן שמעון
  '2446': 7076091,   // מושקוביץ דב איתן
  '2767': 7150161,   // קריספין חיים
  '1335': 7408820,   // ותרי יהונתן
  '61':   8576887,   // גולן יובל-ציון
  '590':  7300039,   // תורגמן מיכאל שמעון
  '1661': 8711891,   // אלחרר נריה
  '306':  7649291,   // הולנדר עומר
  '1051': 9083699,   // בנאסולי עמית
  '2059': 7490520,   // שטרית דוד שמעון
  '1488': 9000539,   // אלקיים רוני
  '848':  7526003,   // שלוסר תומר
  '15':   6867437,   // יהודה אסף
  '2823': 7340317,   // אסולין שיש אסף דוד
  '1313': 5301332,   // דיטש איתמר יצחק
  '1100': 7494109,   // שחף אבגר
  '9100021': 5297488, // גקסון יעקב
  '2675': 7219727,   // גביש גיא
  '3174': 5207612,   // מאיר ערן
  '2037': 7101878,   // עוזרי ישי
};

async function main() {
  console.log('Total soldiers to load:', soldiers.length);

  // Get existing soldiers in כרמלי
  const existing = await p.soldier.findMany({
    where: { battalionId: BID },
    select: { id: true, personalNumber: true, fullName: true, firstName: true, lastName: true, companyId: true },
  });
  console.log('Existing soldiers in כרמלי:', existing.length);

  // First: handle known PN updates
  let pnUpdated = 0;
  for (const [oldPN, newPN] of Object.entries(knownUpdates)) {
    const soldier = existing.find(s => s.personalNumber === oldPN);
    if (soldier) {
      const newPNStr = String(newPN);
      // Find the matching soldier data from our list
      const data = soldiers.find(s => String(s[0]) === newPNStr);
      if (data) {
        const [, first, last, cc] = data;
        const fullName = first + ' ' + last;
        await p.soldier.update({
          where: { id: soldier.id },
          data: {
            personalNumber: newPNStr,
            firstName: first,
            lastName: last,
            fullName: fullName,
            companyId: CO[cc],
          },
        });
        pnUpdated++;
        console.log(`PN UPDATE: ${oldPN} -> ${newPNStr} (${fullName})`);
      }
    }
  }
  console.log(`\nPN updates done: ${pnUpdated}`);

  // Refresh existing list after PN updates
  const existingAfter = await p.soldier.findMany({
    where: { battalionId: BID },
    select: { id: true, personalNumber: true, fullName: true, companyId: true },
  });

  // Now process all soldiers - create new ones
  let created = 0, updated = 0, skipped = 0;

  for (const [pn, first, last, cc] of soldiers) {
    const pnStr = String(pn);
    const fullName = first + ' ' + last;
    const companyId = CO[cc];

    // Check if exists by PN
    let found = existingAfter.find(s => s.personalNumber === pnStr);

    if (found) {
      // Already exists with this PN - update company if needed
      if (found.companyId !== companyId) {
        await p.soldier.update({
          where: { id: found.id },
          data: { companyId, firstName: first, lastName: last, fullName },
        });
        updated++;
        console.log(`UPDATED COMPANY: ${fullName} (${pnStr})`);
      } else {
        skipped++;
      }
    } else {
      // Check by name match (reversed too)
      const reversedName = last + ' ' + first;
      found = existingAfter.find(s => s.fullName === fullName || s.fullName === reversedName);

      if (found) {
        await p.soldier.update({
          where: { id: found.id },
          data: { personalNumber: pnStr, firstName: first, lastName: last, fullName, companyId },
        });
        updated++;
        console.log(`UPDATED BY NAME: ${fullName} (${pnStr})`);
      } else {
        // Create new
        await p.soldier.create({
          data: {
            battalionId: BID,
            personalNumber: pnStr,
            firstName: first,
            lastName: last,
            fullName: fullName,
            companyId: companyId,
            status: 'REGISTERED',
          },
        });
        created++;
      }
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log('PN updates:', pnUpdated);
  console.log('Created:', created);
  console.log('Updated (company/name):', updated);
  console.log('Skipped (no changes):', skipped);
  console.log('Total processed:', soldiers.length);

  const totalNow = await p.soldier.count({ where: { battalionId: BID } });
  console.log('Total soldiers in כרמלי now:', totalNow);

  // Show per-company breakdown
  const companies = await p.holder.findMany({
    where: { battalionId: BID, kind: 'COMPANY', active: true },
    select: { id: true, name: true },
  });
  for (const c of companies) {
    const count = await p.soldier.count({
      where: { battalionId: BID, companyId: c.id, status: { not: 'DISCHARGED' } },
    });
    console.log(`  ${c.name}: ${count}`);
  }

  await p.$disconnect();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
