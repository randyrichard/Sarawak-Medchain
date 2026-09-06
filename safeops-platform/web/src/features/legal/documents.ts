/**
 * The customer-facing text of the privacy notice and terms, in English and Bahasa Malaysia.
 *
 * A condensed reading version of `docs/PERSONAL_DATA_PROTECTION_NOTICE.md` and
 * `docs/TERMS_OF_SERVICE.md`, which remain the source of truth and hold the parts still to
 * be settled. Kept in the bundle rather than fetched so the page renders on a cold load with
 * no API — the state somebody following a link out of an invitation email is in.
 *
 * Both languages, because section 7(3) of the Personal Data Protection Act 2010 requires a
 * notice to be in both national and English language. One language is not a partial
 * compliance, it is a notice that does not meet the section.
 *
 * `draft: true` puts a banner on the page saying it is not in force. It stays until a lawyer
 * has reviewed the text and the placeholders in the source documents are filled in. Removing
 * the flag is the act of publishing, so it should be a deliberate decision by somebody who
 * knows that. The Malay text additionally needs a translator: it was written to be accurate
 * and readable, not to be a certified translation, and the two must be checked against each
 * other before either is relied on.
 */

export interface LegalSection {
  heading: string
  body: string[]
  list?: string[]
}

/** One language's rendering of a document. */
export interface LegalContent {
  title: string
  sections: LegalSection[]
}

export type LegalLanguage = 'en' | 'ms'

export interface LegalDocument {
  version: string
  updated: string
  draft: boolean
  sourceFile: string
  en: LegalContent
  ms: LegalContent
}

/** What the language switch says, in the language it switches to. */
export const LANGUAGE_LABEL: Record<LegalLanguage, string> = {
  en: 'English',
  ms: 'Bahasa Malaysia',
}

/** For the `lang` attribute, so a screen reader uses the right pronunciation. */
export const LANGUAGE_TAG: Record<LegalLanguage, string> = {
  en: 'en',
  ms: 'ms-MY',
}

export const PRIVACY_NOTICE: LegalDocument = {
  version: 'Draft',
  updated: 'Not yet published',
  draft: true,
  sourceFile: 'PERSONAL_DATA_PROTECTION_NOTICE.md',

  en: {
    title: 'Personal Data Protection Notice',
    sections: [
      {
        heading: 'Two different roles',
        body: [
          'For your SafeOps account — your name, work email and sign-in history — SafeOps is the data controller. We decide what to collect and why, because it exists so you can use the product.',
          'For your organisation’s safety records — employee details, incidents, medical fitness dates, visitor logs — your employer is the controller and SafeOps is the processor. They decide what goes in and why; we hold it on their instructions. If you want an incident record corrected, your employer decides.',
        ],
      },
      {
        heading: 'What we hold about you',
        body: ['Your account:'],
        list: [
          'Name, work email, job title and department',
          'Your password, stored only as an Argon2id hash — never the password itself',
          'Sign-in history: time, outcome, IP address, browser and device',
          'Administrative actions you take, with the values you changed',
        ],
      },
      {
        heading: 'What your employer holds in SafeOps',
        body: ['Depending on your role at their organisation, this may include:'],
        list: [
          'Workforce record: employee number, position, department, site, contact details, hire date',
          'Fitness-to-work: medical certificate expiry, blood group, medical restriction notes',
          'Incident records: injury type, body part, treatment, days lost and written statements',
          'Contractor workers: IC or passport number, emergency contact, medical and induction expiry',
          'Visitors: identity document number, nationality, vehicle registration, who they visited',
          'Training, competency and certificates; permits you applied for, authorised or attended',
          'Photographs and documents uploaded against any of the above',
        ],
      },
      {
        heading: 'Health information',
        body: [
          'Medical certificate expiry dates, medical restriction notes, blood group, and the injury details recorded on an incident are sensitive personal data under the Personal Data Protection Act 2010. Sensitive personal data requires explicit consent rather than ordinary consent.',
          'Where SafeOps is the processor, obtaining that consent is your employer’s responsibility. We hold the record of it; we do not obtain it for them.',
        ],
      },
      {
        heading: 'Who can see it inside your organisation',
        body: ['Not everyone, and this is enforced by the software rather than by policy:'],
        list: [
          'Medical detail is visible only to Administrators, HSE Managers and Safety Officers. Other roles see whether a certificate is valid, expiring or expired — not the underlying data',
          'People assigned to particular sites see only those sites’ records',
          'Employees see the incidents they reported themselves, not their colleagues’',
          'An anonymous report withholds the reporter’s identity from everyone below HSE Manager',
        ],
      },
      {
        heading: 'Who else it goes to',
        body: [
          'Your employer and the colleagues they authorise. Our hosting provider, which stores it. Our email provider, which receives a recipient’s name and address in order to send an invitation, a password reset or a scheduled report. A regulator, court or law enforcement where lawfully required.',
          'We do not sell personal data, we do not use it to train machine-learning models, and there are no advertising or analytics recipients.',
        ],
      },
      {
        heading: 'Your rights',
        body: [
          'You may ask what we hold about you and receive a copy, ask us to correct it, withdraw consent, or complain to the Personal Data Protection Commissioner.',
          'Where the data belongs to your organisation, ask your employer first — they decide and we act on their instruction. Some records cannot simply be removed: an incident report is a safety and legal record your employer may be required to keep, and removing someone from it would falsify it.',
          'Your employer can export their entire workspace at any time, as spreadsheets plus every uploaded file, readable without SafeOps.',
        ],
      },
      {
        heading: 'Security',
        body: [
          'Passwords are stored as Argon2id hashes and are not recoverable by anyone, including us. Sessions use short-lived signed tokens, with the long-lived part in a cookie page scripts cannot read. Access is checked on the server on every request, against your role and your sites. Uploaded files are stored under server-generated names, recorded with a SHA-256 digest so a changed or corrupted file can be detected, and served only to people authorised for the record they belong to.',
          'The software requires the connection to be encrypted: it refuses to start in production unless its public address is HTTPS, because every invitation and password-reset link carries a single-use credential in the URL. Whether a given deployment is actually served over HTTPS is a property of that deployment, and is one of the things listed below as still to be confirmed.',
          'No system is perfectly secure and we do not claim otherwise.',
        ],
      },
      {
        heading: 'Still to be settled',
        body: [
          'These are recorded in the source document and are not yet decided. They must be, before this notice is published — a stated retention period the software does not apply would be worse than none.',
        ],
        list: [
          'How long each kind of record is kept, and what happens at the end of that period',
          'Where the data is hosted, and whether any of it leaves Malaysia — section 129 governs transfers abroad',
          'The breach notification procedure, and the 72-hour notification duty in force since 1 June 2025',
          'Whether a Data Protection Officer must be appointed, and who that is',
          'Confirmation that the deployment serving this notice is in fact served over HTTPS',
          'Legal review of both language versions, and a translator’s check that they agree',
        ],
      },
    ],
  },

  ms: {
    title: 'Notis Perlindungan Data Peribadi',
    sections: [
      {
        heading: 'Dua peranan yang berbeza',
        body: [
          'Bagi akaun SafeOps anda — nama, e-mel kerja dan sejarah log masuk anda — SafeOps ialah pengawal data. Kami menentukan apa yang dikumpul dan mengapa, kerana ia wujud supaya anda boleh menggunakan produk ini.',
          'Bagi rekod keselamatan organisasi anda — butiran pekerja, insiden, tarikh kesihatan, log pelawat — majikan anda ialah pengawal data dan SafeOps ialah pemproses data. Mereka menentukan apa yang dimasukkan dan mengapa; kami menyimpannya atas arahan mereka. Jika anda mahu rekod insiden dibetulkan, majikan anda yang memutuskan.',
        ],
      },
      {
        heading: 'Apa yang kami simpan tentang anda',
        body: ['Akaun anda:'],
        list: [
          'Nama, e-mel kerja, jawatan dan jabatan',
          'Kata laluan anda, disimpan hanya sebagai cincangan (hash) Argon2id — bukan kata laluan itu sendiri',
          'Sejarah log masuk: masa, keputusan, alamat IP, pelayar dan peranti',
          'Tindakan pentadbiran yang anda lakukan, berserta nilai yang anda ubah',
        ],
      },
      {
        heading: 'Apa yang majikan anda simpan dalam SafeOps',
        body: ['Bergantung pada peranan anda di organisasi mereka, ini mungkin termasuk:'],
        list: [
          'Rekod pekerja: nombor pekerja, jawatan, jabatan, tapak, butiran perhubungan, tarikh mula kerja',
          'Kesihatan untuk bekerja: tarikh luput sijil perubatan, kumpulan darah, nota sekatan perubatan',
          'Rekod insiden: jenis kecederaan, bahagian badan, rawatan, hari hilang bekerja dan pernyataan bertulis',
          'Pekerja kontraktor: nombor kad pengenalan atau pasport, hubungan kecemasan, tarikh luput perubatan dan induksi',
          'Pelawat: nombor dokumen pengenalan, kewarganegaraan, nombor pendaftaran kenderaan, siapa yang dilawati',
          'Latihan, kompetensi dan sijil; permit yang anda pohon, luluskan atau hadiri',
          'Gambar dan dokumen yang dimuat naik bagi mana-mana perkara di atas',
        ],
      },
      {
        heading: 'Maklumat kesihatan',
        body: [
          'Tarikh luput sijil perubatan, nota sekatan perubatan, kumpulan darah, dan butiran kecederaan yang direkodkan dalam sesuatu insiden ialah data peribadi sensitif di bawah Akta Perlindungan Data Peribadi 2010. Data peribadi sensitif memerlukan keizinan yang nyata, bukan keizinan biasa.',
          'Apabila SafeOps bertindak sebagai pemproses data, tanggungjawab memperoleh keizinan tersebut terletak pada majikan anda. Kami menyimpan rekod keizinan itu; kami tidak memperolehnya bagi pihak mereka.',
        ],
      },
      {
        heading: 'Siapa yang boleh melihatnya dalam organisasi anda',
        body: ['Bukan semua orang, dan ini dikuatkuasakan oleh perisian, bukan sekadar oleh dasar:'],
        list: [
          'Butiran perubatan hanya boleh dilihat oleh Pentadbir, Pengurus HSE dan Pegawai Keselamatan. Peranan lain hanya melihat sama ada sesuatu sijil sah, hampir luput atau telah luput — bukan data asasnya',
          'Mereka yang ditugaskan ke tapak tertentu hanya melihat rekod tapak berkenaan',
          'Pekerja melihat insiden yang mereka laporkan sendiri, bukan insiden rakan sekerja',
          'Laporan tanpa nama merahsiakan identiti pelapor daripada semua peranan di bawah Pengurus HSE',
        ],
      },
      {
        heading: 'Kepada siapa lagi ia diberikan',
        body: [
          'Majikan anda dan rakan sekerja yang mereka benarkan. Penyedia pengehosan kami, yang menyimpannya. Penyedia e-mel kami, yang menerima nama dan alamat penerima bagi menghantar jemputan, penetapan semula kata laluan atau laporan berjadual. Pihak berkuasa kawal selia, mahkamah atau penguatkuasa undang-undang apabila dikehendaki di sisi undang-undang.',
          'Kami tidak menjual data peribadi, kami tidak menggunakannya untuk melatih model pembelajaran mesin, dan tiada penerima bagi tujuan pengiklanan atau analitik.',
        ],
      },
      {
        heading: 'Hak anda',
        body: [
          'Anda boleh meminta maklumat tentang apa yang kami simpan mengenai anda dan menerima salinannya, meminta kami membetulkannya, menarik balik keizinan, atau membuat aduan kepada Pesuruhjaya Perlindungan Data Peribadi.',
          'Jika data itu milik organisasi anda, tanya majikan anda terlebih dahulu — mereka yang memutuskan dan kami bertindak atas arahan mereka. Sesetengah rekod tidak boleh dibuang begitu sahaja: laporan insiden ialah rekod keselamatan dan undang-undang yang mungkin wajib disimpan oleh majikan anda, dan membuang seseorang daripadanya bermakna memalsukannya.',
          'Majikan anda boleh mengeksport keseluruhan ruang kerja mereka pada bila-bila masa, dalam bentuk hamparan berserta setiap fail yang dimuat naik, yang boleh dibaca tanpa SafeOps.',
        ],
      },
      {
        heading: 'Keselamatan',
        body: [
          'Kata laluan disimpan sebagai cincangan Argon2id dan tidak boleh dipulihkan oleh sesiapa pun, termasuk kami. Sesi menggunakan token bertandatangan yang berjangka pendek, dengan bahagian berjangka panjang disimpan dalam kuki yang tidak boleh dibaca oleh skrip halaman. Kebenaran akses diperiksa di pelayan bagi setiap permintaan, mengikut peranan dan tapak anda. Fail yang dimuat naik disimpan di bawah nama yang dijana oleh pelayan, direkodkan dengan cincangan SHA-256 supaya fail yang diubah atau rosak dapat dikesan, dan hanya dihidangkan kepada mereka yang dibenarkan bagi rekod berkenaan.',
          'Perisian ini menghendaki sambungan disulitkan: ia enggan dimulakan dalam persekitaran pengeluaran melainkan alamat awamnya menggunakan HTTPS, kerana setiap pautan jemputan dan penetapan semula kata laluan membawa kelayakan sekali guna di dalam URL. Sama ada sesuatu pemasangan benar-benar dihidangkan melalui HTTPS adalah sifat pemasangan tersebut, dan ia tersenarai di bawah sebagai perkara yang masih perlu disahkan.',
          'Tiada sistem yang selamat sepenuhnya dan kami tidak mendakwa sebaliknya.',
        ],
      },
      {
        heading: 'Perkara yang masih belum diputuskan',
        body: [
          'Perkara berikut direkodkan dalam dokumen sumber dan masih belum diputuskan. Ia mesti diputuskan sebelum notis ini diterbitkan — tempoh penyimpanan yang dinyatakan tetapi tidak dilaksanakan oleh perisian adalah lebih buruk daripada tiada langsung.',
        ],
        list: [
          'Berapa lama setiap jenis rekod disimpan, dan apa yang berlaku pada akhir tempoh tersebut',
          'Di mana data dihoskan, dan sama ada mana-mana daripadanya keluar dari Malaysia — seksyen 129 mengawal pemindahan ke luar negara',
          'Prosedur pemberitahuan pelanggaran data, dan kewajipan memberitahu dalam tempoh 72 jam yang berkuat kuasa sejak 1 Jun 2025',
          'Sama ada Pegawai Perlindungan Data perlu dilantik, dan siapa orangnya',
          'Pengesahan bahawa pemasangan yang menghidangkan notis ini benar-benar menggunakan HTTPS',
          'Semakan guaman bagi kedua-dua versi bahasa, dan semakan penterjemah bahawa kedua-duanya sepadan',
        ],
      },
    ],
  },
}

export const TERMS_OF_SERVICE: LegalDocument = {
  version: 'Draft',
  updated: 'Not yet published',
  draft: true,
  sourceFile: 'TERMS_OF_SERVICE.md',

  en: {
    title: 'Terms of Service',
    sections: [
      {
        heading: 'What the service is',
        body: [
          'SafeOps is safety management software: incident reporting and investigation, permits to work, corrective actions, competency records, audits, and contractor and visitor management. It records and organises what your organisation tells it. It does not make safety decisions for you and it is not a substitute for a competent person.',
        ],
      },
      {
        heading: 'Pilot',
        body: [
          'During a pilot the service is provided free of charge, without a service-level commitment, and either side may end it at any time. Features may change. We will tell you before anything that would lose data.',
        ],
      },
      {
        heading: 'Your account',
        body: [
          'Keep your credentials to yourself. Accounts belong to individuals and must not be shared — the audit trail records who did what, and a shared account makes that record untrue.',
          'Tell your administrator immediately if you think someone else has used your account.',
        ],
      },
      {
        heading: 'Your data is yours',
        body: [
          'Everything your organisation puts into SafeOps remains your organisation’s. You can export all of it at any time, as spreadsheets plus every uploaded file, in formats readable without this product. We do not sell it, and we do not use it to train machine-learning models.',
        ],
      },
      {
        heading: 'Backups, and what they do not cover',
        body: [
          'Backups are taken and restoring one has been tested end to end. A backup protects against loss of the system; it does not undo a deletion you made deliberately, and it restores to the moment it was taken rather than to now.',
        ],
      },
      {
        heading: 'Limits',
        body: [
          'The software is provided as it is. It cannot make your workplace safe; it records what you do about that. Nothing here limits liability that cannot lawfully be limited.',
        ],
      },
    ],
  },

  ms: {
    title: 'Terma Perkhidmatan',
    sections: [
      {
        heading: 'Apakah perkhidmatan ini',
        body: [
          'SafeOps ialah perisian pengurusan keselamatan: pelaporan dan penyiasatan insiden, permit kerja, tindakan pembetulan, rekod kompetensi, audit, serta pengurusan kontraktor dan pelawat. Ia merekod dan menyusun apa yang dimaklumkan oleh organisasi anda. Ia tidak membuat keputusan keselamatan bagi pihak anda dan ia bukan pengganti kepada orang yang kompeten.',
        ],
      },
      {
        heading: 'Perintis',
        body: [
          'Sepanjang tempoh perintis, perkhidmatan ini disediakan secara percuma, tanpa komitmen tahap perkhidmatan, dan mana-mana pihak boleh menamatkannya pada bila-bila masa. Ciri-ciri mungkin berubah. Kami akan memaklumkan anda sebelum apa-apa perubahan yang akan menghilangkan data.',
        ],
      },
      {
        heading: 'Akaun anda',
        body: [
          'Rahsiakan kelayakan log masuk anda. Akaun adalah milik individu dan tidak boleh dikongsi — jejak audit merekodkan siapa melakukan apa, dan akaun yang dikongsi menjadikan rekod itu tidak benar.',
          'Maklumkan kepada pentadbir anda dengan segera jika anda mengesyaki orang lain telah menggunakan akaun anda.',
        ],
      },
      {
        heading: 'Data anda ialah milik anda',
        body: [
          'Semua yang dimasukkan oleh organisasi anda ke dalam SafeOps kekal menjadi milik organisasi anda. Anda boleh mengeksport kesemuanya pada bila-bila masa, dalam bentuk hamparan berserta setiap fail yang dimuat naik, dalam format yang boleh dibaca tanpa produk ini. Kami tidak menjualnya, dan kami tidak menggunakannya untuk melatih model pembelajaran mesin.',
        ],
      },
      {
        heading: 'Sandaran, dan apa yang tidak dilindunginya',
        body: [
          'Sandaran dibuat dan proses pemulihannya telah diuji dari mula hingga akhir. Sandaran melindungi daripada kehilangan sistem; ia tidak membatalkan pemadaman yang anda lakukan dengan sengaja, dan ia memulihkan kepada keadaan pada masa sandaran itu diambil, bukan kepada masa sekarang.',
        ],
      },
      {
        heading: 'Batasan',
        body: [
          'Perisian ini disediakan sebagaimana adanya. Ia tidak boleh menjadikan tempat kerja anda selamat; ia merekodkan apa yang anda lakukan mengenainya. Tiada apa-apa di sini yang mengehadkan liabiliti yang tidak boleh dihadkan di sisi undang-undang.',
        ],
      },
    ],
  },
}
