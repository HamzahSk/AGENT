"""Author and validate Ro-Lang's bundled, offline corpus (no services required)."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = ("en", "id", "tl")
STORIES = []


def story(family, category, level, titles, summaries, sentences):
    STORIES.append(dict(id=f"{family}_{level.lower()}", family=family, category=category,
                        level=level, title=dict(zip(LANGUAGES, titles)),
                        summary=dict(zip(LANGUAGES, summaries)),
                        sentences=[dict(zip(LANGUAGES, s)) for s in sentences]))


MARKET = ("The morning market", "Pasar pagi", "Ang palengke sa umaga")
LETTER = ("The island letter", "Surat dari pulau", "Ang liham mula sa isla")
RIVER = ("A river for everyone", "Sungai untuk semua", "Isang ilog para sa lahat")

story("market", "Everyday life", "BEGINNER", MARKET,
      ("A small act of kindness at the market.", "Kebaikan kecil di pasar.", "Isang munting kabutihan sa palengke."), [
    ("Maya walks to the market in the morning.", "Maya berjalan ke pasar pada pagi hari.", "Naglalakad si Maya papunta sa palengke sa umaga."),
    ("She buys bread and sweet fruit for her family.", "Dia membeli roti dan buah manis untuk keluarganya.", "Bumibili siya ng tinapay at matamis na prutas para sa pamilya niya."),
    ("An old woman drops a bag. Maya helps her and smiles.", "Seorang wanita tua menjatuhkan tas. Maya membantunya dan tersenyum.", "Nahuhulog ang bag ng isang matandang babae. Tinutulungan siya ni Maya at ngumingiti."),
])
story("market", "Everyday life", "INTERMEDIATE", MARKET,
      ("Kindness becomes a shared meal.", "Kebaikan menjadi makanan bersama.", "Ang kabutihan ay nagiging salu-salo."), [
    ("While Maya chooses fresh fruit, an old woman drops her heavy bag.", "Saat Maya memilih buah segar, seorang wanita tua menjatuhkan tas beratnya.", "Habang pumipili si Maya ng sariwang prutas, nahuhulog ang mabigat na bag ng isang matandang babae."),
    ("Maya gathers the oranges and carries the bag to a quiet bench.", "Maya mengumpulkan jeruk dan membawa tas itu ke bangku yang tenang.", "Pinupulot ni Maya ang mga kahel at dinadala ang bag sa isang tahimik na bangko."),
    ("Because the woman is grateful, she shares her bread with Maya before they return home.", "Karena wanita itu berterima kasih, dia berbagi roti dengan Maya sebelum mereka pulang.", "Dahil nagpapasalamat ang babae, ibinabahagi niya ang tinapay kay Maya bago sila umuwi."),
])
story("market", "Everyday life", "ADVANCED", MARKET,
      ("An ordinary market reveals an unexpected connection.", "Pasar biasa memperlihatkan hubungan tak terduga.", "Isang karaniwang palengke ang nagpapakita ng di-inaasahang ugnayan."), [
    ("Although the crowded market seems indifferent, Maya notices an elderly woman struggling beneath the weight of her purchases.", "Meskipun pasar ramai tampak tak peduli, Maya memperhatikan seorang wanita lanjut usia yang kesulitan menanggung beban belanjaannya.", "Bagaman tila walang pakialam ang mataong palengke, napapansin ni Maya ang isang matandang babae na nahihirapan sa bigat ng mga pinamili niya."),
    ("Rather than hurry past, she offers assistance, discovering that the woman once taught her mother.", "Alih-alih berlalu terburu-buru, dia menawarkan bantuan dan mengetahui bahwa wanita itu pernah mengajar ibunya.", "Sa halip na magmadaling lumampas, nag-aalok siya ng tulong at natutuklasan na minsang nagturo ang babae sa ina niya."),
    ("Their unexpected connection transforms a routine errand into a reminder that communities flourish through everyday generosity.", "Hubungan tak terduga mereka mengubah urusan rutin menjadi pengingat bahwa masyarakat berkembang melalui kemurahan hati sehari-hari.", "Binabago ng di-inaasahang ugnayan nila ang karaniwang gawain upang maging paalala na umuunlad ang mga pamayanan sa pamamagitan ng araw-araw na pagkabukas-palad."),
])
story("letter", "Mystery", "BEGINNER", LETTER,
      ("Leo finds a letter beside the sea.", "Leo menemukan surat di dekat laut.", "Nakakahanap si Leo ng liham sa tabi ng dagat."), [
    ("Leo lives on a small island near the sea.", "Leo tinggal di pulau kecil dekat laut.", "Nakatira si Leo sa isang maliit na isla malapit sa dagat."),
    ("One day, he finds a letter under a blue door.", "Suatu hari, dia menemukan surat di bawah pintu biru.", "Isang araw, nakakahanap siya ng liham sa ilalim ng asul na pinto."),
    ("The letter says: follow the light. Leo sees his sister with a lamp and laughs.", "Surat itu berkata: ikuti cahaya. Leo melihat saudarinya dengan lampu dan tertawa.", "Sinasabi ng liham: sundan ang liwanag. Nakikita ni Leo ang kapatid niya na may ilawan at tumatawa."),
])
story("letter", "Mystery", "INTERMEDIATE", LETTER,
      ("A mysterious message leads to a familiar face.", "Pesan misterius membawa ke wajah yang dikenal.", "Isang mahiwagang mensahe ang humahantong sa pamilyar na mukha."), [
    ("After the storm, Leo discovers a mysterious letter beneath his blue door.", "Setelah badai, Leo menemukan surat misterius di bawah pintu birunya.", "Pagkatapos ng bagyo, natutuklasan ni Leo ang isang mahiwagang liham sa ilalim ng asul na pinto niya."),
    ("The message asks him to follow a light along the beach, although the evening is dark.", "Pesan itu memintanya mengikuti cahaya sepanjang pantai, meskipun malam gelap.", "Hinihiling ng mensahe na sundan niya ang liwanag sa kahabaan ng dalampasigan, bagaman madilim ang gabi."),
    ("When he reaches the lighthouse, his sister welcomes him with a warm meal and explains her surprise.", "Ketika dia mencapai mercusuar, saudarinya menyambutnya dengan makanan hangat dan menjelaskan kejutannya.", "Kapag nararating niya ang parola, sinasalubong siya ng kapatid niya na may mainit na pagkain at ipinapaliwanag ang sorpresa niya."),
])
story("letter", "Mystery", "ADVANCED", LETTER,
      ("Uncertainty gives way to trust on a stormy island.", "Ketidakpastian berubah menjadi kepercayaan di pulau berbadai.", "Ang kawalan ng katiyakan ay nagiging tiwala sa isang mabagyong isla."), [
    ("Having discovered an unsigned letter after the storm, Leo hesitates between curiosity and suspicion.", "Setelah menemukan surat tanpa tanda tangan seusai badai, Leo ragu antara rasa ingin tahu dan kecurigaan.", "Matapos matuklasan ang isang liham na walang lagda pagkatapos ng bagyo, nag-aalinlangan si Leo sa pagitan ng pag-uusisa at pagdududa."),
    ("The distant lighthouse, whose beam intermittently illuminates the abandoned shore, appears to confirm the message.", "Mercusuar jauh, yang sinarnya sesekali menerangi pantai sepi, tampaknya membenarkan pesan itu.", "Ang malayong parola, na paminsan-minsang nagliliwanag sa iniwang baybayin, ay tila nagpapatunay sa mensahe."),
    ("Only when his sister emerges with a welcoming lamp does he realize that uncertainty can conceal an invitation to trust.", "Baru ketika saudarinya muncul dengan lampu penyambutan, dia menyadari bahwa ketidakpastian dapat menyembunyikan ajakan untuk percaya.", "Kapag lumilitaw ang kapatid niya na may ilawang panalubong, saka lamang niya nauunawaan na maaaring magtago ang kawalan ng katiyakan ng isang paanyaya na magtiwala."),
])
story("river", "Nature & adventure", "BEGINNER", RIVER,
      ("Friends care for a river.", "Teman-teman merawat sungai.", "Inaalagaan ng magkakaibigan ang isang ilog."), [
    ("Ana and her friends visit a river in the forest.", "Ana dan teman-temannya mengunjungi sungai di hutan.", "Dumadalaw si Ana at ang mga kaibigan niya sa isang ilog sa gubat."),
    ("They see plastic in the water and collect it.", "Mereka melihat plastik di air dan mengumpulkannya.", "Nakakakita sila ng plastik sa tubig at kinokolekta ito."),
    ("Now the river is clean. Birds sing, and everyone feels happy.", "Sekarang sungai itu bersih. Burung bernyanyi, dan semua merasa senang.", "Ngayon ay malinis ang ilog. Umaawit ang mga ibon, at masaya ang lahat."),
])
story("river", "Nature & adventure", "INTERMEDIATE", RIVER,
      ("A shared effort brings the forest back to life.", "Usaha bersama menghidupkan kembali hutan.", "Binubuhay ng sama-samang pagsisikap ang gubat."), [
    ("When Ana notices plastic floating in the river, she invites her friends to help.", "Ketika Ana memperhatikan plastik mengambang di sungai, dia mengajak teman-temannya membantu.", "Kapag napapansin ni Ana ang plastik na lumulutang sa ilog, inaanyayahan niya ang mga kaibigan na tumulong."),
    ("They carefully collect the waste and separate it into different bags so that it can be recycled.", "Mereka mengumpulkan sampah dengan hati-hati dan memisahkannya ke tas berbeda agar dapat didaur ulang.", "Maingat nilang kinokolekta ang basura at pinaghihiwalay ito sa magkakaibang bag upang maaari itong ma-recycle."),
    ("By the afternoon, the water looks clearer, and the group promises to protect the forest together.", "Pada sore hari, air tampak lebih jernih, dan kelompok itu berjanji melindungi hutan bersama.", "Pagsapit ng hapon, mas malinaw ang tubig, at nangangako ang grupo na sama-samang protektahan ang gubat."),
])
story("river", "Nature & adventure", "ADVANCED", RIVER,
      ("A cleanup inspires lasting responsibility.", "Pembersihan menginspirasi tanggung jawab berkelanjutan.", "Ang paglilinis ay nagbibigay ng inspirasyon sa pangmatagalang pananagutan."), [
    ("Recognizing that a single cleanup cannot reverse years of neglect, Ana proposes a sustained effort to restore the river.", "Menyadari bahwa satu pembersihan tidak dapat membalikkan pengabaian bertahun-tahun, Ana mengusulkan usaha berkelanjutan untuk memulihkan sungai.", "Dahil nauunawaan na hindi maibabalik ng isang paglilinis ang mga taon ng pagpapabaya, nagmumungkahi si Ana ng patuloy na pagsisikap upang ibalik ang ilog."),
    ("Her friends initially doubt whether their contribution matters, yet the gradual return of birds strengthens their resolve.", "Teman-temannya awalnya meragukan apakah kontribusi mereka berarti, tetapi kembalinya burung secara bertahap memperkuat tekad mereka.", "Sa simula ay nagdududa ang mga kaibigan kung mahalaga ang ambag nila, ngunit pinatitibay ng unti-unting pagbabalik ng mga ibon ang pasya nila."),
    ("What began as an ordinary walk becomes a collective commitment, reminding everyone that environmental responsibility requires persistence.", "Perjalanan biasa menjadi komitmen bersama, mengingatkan semua bahwa tanggung jawab lingkungan memerlukan ketekunan.", "Ang nagsimula bilang karaniwang paglalakad ay nagiging sama-samang pangako, na nagpapaalala sa lahat na nangangailangan ng tiyaga ang pananagutan sa kapaligiran."),
])

# Inflected forms are intentionally included; each row is a contextual gloss,
# not a claim that languages share a one-to-one grammatical structure.
# Slash-separated forms on the left add aliases; translations use semicolons.
GLOSSARY = """
Maya|Maya|Maya|proper noun
Leo|Leo|Leo|proper noun
Ana|Ana|Ana|proper noun
market|pasar|palengke|noun
morning|pagi|umaga|noun
walks|berjalan|naglalakad|verb
buys|membeli|bumibili|verb
bread|roti|tinapay|noun
sweet|manis|matamis|adjective
fruit|buah|prutas|noun
family|keluarga/keluarganya|pamilya|noun
old/elderly|tua|matanda/matandang|adjective
woman|wanita|babae|noun
drops|menjatuhkan|nahuhulog|verb
bag|tas|bag|noun
helps/help|membantu/membantunya|tinutulungan/tumulong|verb
smiles|tersenyum|ngumingiti|verb
chooses|memilih|pumipili|verb
fresh|segar|sariwa/sariwang|adjective
heavy|berat/beratnya|mabigat|adjective
gathers/collect/collects|mengumpulkan/mengumpulkannya|pinupulot/kinokolekta|verb
oranges|jeruk|kahel|noun
carries|membawa|dinadala|verb
quiet|tenang|tahimik|adjective
bench|bangku|bangko|noun
grateful|berterima|nagpapasalamat|adjective
shares|berbagi|ibinabahagi|verb
return|pulang|umuwi|verb
home|rumah|bahay|noun
crowded|ramai|mataong|adjective
seems/appears|tampak/tampaknya|tila|verb
indifferent|acuh|pakialam|adjective
notices|memperhatikan|napapansin|verb
struggling|kesulitan|nahihirapan|verb
weight|beban|bigat|noun
purchases|belanjaannya|pinamili|noun
hurry|terburu-buru|magmadaling|verb
past|berlalu|lumampas|adverb
offers|menawarkan|nag-aalok|verb
assistance|bantuan|tulong|noun
discovering/discovers/discovered/finds|menemukan/mengetahui|natutuklasan/nakakahanap/matuklasan|verb
once|pernah|minsang|adverb
taught|mengajar|nagturo|verb
mother|ibu/ibunya|ina|noun
unexpected|terduga|di-inaasahang|adjective
connection|hubungan|ugnayan|noun
transforms|mengubah|binabago|verb
routine/ordinary|rutin/biasa|karaniwang|adjective
errand|urusan|gawain|noun
reminder|pengingat|paalala|noun
communities|masyarakat|pamayanan|noun
flourish|berkembang|umuunlad|verb
everyday|sehari-hari|araw-araw|adjective
generosity|kemurahan|pagkabukas-palad|noun
lives|tinggal|nakatira|verb
small|kecil|maliit|adjective
island|pulau|isla|noun
near|dekat|malapit|preposition
sea|laut|dagat|noun
day|hari|araw|noun
letter|surat|liham|noun
blue|biru/birunya|asul|adjective
door|pintu|pinto|noun
says|berkata|sinasabi|verb
follow|ikuti/mengikuti|sundan|verb
light|cahaya|liwanag|noun
sees/see|melihat|nakikita/nakakakita|verb
sister|saudari/saudarinya|kapatid|noun
lamp|lampu|ilawan/ilawang|noun
laughs|tertawa|tumatawa|verb
storm|badai|bagyo|noun
mysterious|misterius|mahiwagang|adjective
message|pesan|mensahe|noun
asks|meminta/memintanya|hinihiling|verb
beach|pantai|dalampasigan|noun
evening|malam|gabi|noun
dark|gelap|madilim|adjective
reaches|mencapai|nararating|verb
lighthouse|mercusuar|parola|noun
welcomes|menyambut/menyambutnya|sinasalubong|verb
warm|hangat|mainit|adjective
meal|makanan|pagkain|noun
explains|menjelaskan|ipinapaliwanag|verb
surprise|kejutan/kejutannya|sorpresa|noun
unsigned|tanpa|walang|adjective
signature|tanda|lagda|noun
hand|tangan|kamay|noun
hesitates|ragu|nag-aalinlangan|verb
curiosity|rasa|pag-uusisa|noun
desire|ingin|gusto|noun
know|tahu|alam|verb
suspicion|kecurigaan|pagdududa|noun
distant|jauh|malayong|adjective
beam|sinar/sinarnya|sinag|noun
intermittently|sesekali|paminsan-minsang|adverb
illuminates|menerangi|nagliliwanag|verb
abandoned|sepi|iniwang|adjective
shore|pantai|baybayin|noun
confirm|membenarkan|nagpapatunay|verb
emerges|muncul|lumilitaw|verb
welcoming|penyambutan|panalubong|adjective
realize|menyadari|nauunawaan|verb
uncertainty|ketidakpastian|kawalan|noun
certainty|kepastian|katiyakan|noun
conceal|menyembunyikan|magtago|verb
invitation|ajakan|paanyaya|noun
trust|percaya|magtiwala|verb
friends|teman-teman/teman-temannya|kaibigan|noun
visit|mengunjungi|dumadalaw|verb
river|sungai|ilog|noun
forest|hutan|gubat|noun
plastic|plastik|plastik|noun
water|air|tubig|noun
now|sekarang|ngayon|adverb
clean|bersih|malinis|adjective
birds|burung|ibon|noun
sing|bernyanyi|umaawit|verb
everyone|semua|lahat|pronoun
feels|merasa|nararamdaman|verb
happy|senang|masaya|adjective
floating|mengambang|lumulutang|verb
invites|mengajak|inaanyayahan|verb
carefully|hati-hati|maingat|adverb
waste|sampah|basura|noun
separate|memisahkannya|pinaghihiwalay|verb
different|berbeda|magkakaibang|adjective
bags|tas|bag|noun
recycled|didaur|ma-recycle|verb
again|ulang|muli|adverb
afternoon|sore|hapon|noun
looks|tampak|mukhang|verb
clearer|jernih|malinaw|adjective
more|lebih|mas|adverb
group|kelompok|grupo|noun
promises|berjanji|nangangako|verb
protect|melindungi|protektahan|verb
together|bersama|sama-sama/sama-samang|adverb
recognizing|menyadari|nauunawaan|verb
single|satu|isang|adjective
cleanup|pembersihan|paglilinis|noun
reverse|membalikkan|maibabalik|verb
years|bertahun-tahun|taon|noun
neglect|pengabaian|pagpapabaya|noun
proposes|mengusulkan|nagmumungkahi|verb
sustained|berkelanjutan|patuloy|adjective
effort|usaha|pagsisikap|noun
restore|memulihkan|ibalik|verb
initially|awalnya|simula|adverb
doubt|meragukan|nagdududa|verb
contribution|kontribusi|ambag|noun
matters|berarti|mahalaga|verb
gradual|bertahap|unti-unting|adjective
return|kembalinya|pagbabalik|noun
strengthens|memperkuat|pinatitibay|verb
resolve|tekad|pasya|noun
began|mulai|nagsimula|verb
walk|perjalanan|paglalakad|noun
becomes|menjadi|nagiging|verb
collective|bersama|sama|adjective
commitment|komitmen|pangako|noun
reminding|mengingatkan|nagpapaalala|verb
environmental|lingkungan|kapaligiran|adjective
responsibility|tanggung|pananagutan|noun
answer|jawab|sagot|noun
requires|memerlukan|nangangailangan|verb
persistence|ketekunan|tiyaga|noun
the/a/an|itu/seorang|ang|article
and|dan|at|conjunction
to|ke|papunta|preposition
in/on/at|di/pada|sa|preposition
for|untuk|para|preposition
she/he|dia|siya|pronoun
her/his|nya|niya|pronoun
their|mereka|nila/nilang|pronoun
they|mereka|sila|pronoun
it|itu|ito/itong|pronoun
of|dari|ng|preposition
while|saat|habang|conjunction
with|dengan|kay|preposition
before|sebelum|bago|conjunction
because|karena|dahil|conjunction
is|adalah|ay|verb
although|meskipun|bagaman|conjunction
beneath/under|bawah|ilalim|preposition
rather|alih-alih|halip|adverb
than|daripada|kaysa|conjunction
that|bahwa/yang|na|conjunction
through|melalui|pamamagitan|preposition
one|suatu|isang|numeral
after|setelah/seusai|pagkatapos/matapos|conjunction
him|dia|siya|pronoun
along|sepanjang|kahabaan|preposition
when|ketika|kapag|conjunction
having|telah|matapos|auxiliary
between|antara|pagitan|preposition
whose|yang|na|pronoun
only|baru|lamang|adverb
does|melakukan|ginagawa|auxiliary
can|dapat|maaari/maaaring|auxiliary
so|agar|upang|conjunction
be|menjadi|maging|verb
by|oleh|pagsapit|preposition
cannot|tidak|hindi|auxiliary
whether|apakah|kung|conjunction
yet|tetapi|ngunit|conjunction
what|apa|ano|pronoun
as|sebagai|bilang|preposition
into|menjadi|maging|preposition
si|si|si|marker
ni|oleh|ni|marker
not|tak|di|adverb
then|kemudian|saka|adverb
thanks|kasih|salamat|noun
heart|hati|puso|noun
advanced|lanjut|patuloy|adjective
age|usia|edad|noun
bear|menanggung|pasanin|verb
in a manner|secara|sa paraan|adverb
has|memiliki|may|verb
plural marker|penanda jamak|mga|marker
caring|peduli|pakialam|noun
"""

# Full definitions for core vocabulary in all reference languages.
DEFINITIONS = {
    "market": ("A place where people buy and sell goods.", "Tempat orang membeli dan menjual barang.", "Lugar kung saan bumibili at nagbebenta ng mga paninda."),
    "morning": ("The early part of the day, before noon.", "Bagian awal hari sebelum siang.", "Maagang bahagi ng araw bago magtanghali."),
    "bread": ("Food made from flour and baked.", "Makanan dari tepung yang dipanggang.", "Pagkaing gawa sa harina at inihurno."),
    "fruit": ("The edible part of a plant that often contains seeds.", "Bagian tumbuhan yang dapat dimakan dan sering berbiji.", "Nakakaing bahagi ng halaman na karaniwang may buto."),
    "family": ("People related by birth, marriage, or close care.", "Orang yang terikat oleh kelahiran, pernikahan, atau pengasuhan.", "Mga taong magkaugnay sa kapanganakan, kasal, o pag-aaruga."),
    "woman": ("An adult female person.", "Orang perempuan dewasa.", "Isang taong babaeng nasa hustong gulang."),
    "bag": ("A container used to carry things.", "Wadah untuk membawa barang.", "Lalagyang ginagamit sa pagdadala ng mga bagay."),
    "bench": ("A long seat for more than one person.", "Tempat duduk panjang untuk beberapa orang.", "Mahabang upuan para sa higit sa isang tao."),
    "assistance": ("Help offered to someone who needs it.", "Pertolongan untuk orang yang membutuhkan.", "Tulong na ibinibigay sa nangangailangan."),
    "connection": ("A relationship linking people or things.", "Hubungan yang mengaitkan orang atau hal.", "Ugnayang nagdurugtong sa mga tao o bagay."),
    "errand": ("A short trip to complete an everyday task.", "Perjalanan singkat untuk menyelesaikan urusan sehari-hari.", "Maikling pagpunta upang tapusin ang isang gawain."),
    "generosity": ("A willingness to give time, help, or resources.", "Kesediaan memberi waktu, bantuan, atau sumber daya.", "Kusang pagbibigay ng oras, tulong, o mga yaman."),
    "island": ("Land surrounded by water.", "Daratan yang dikelilingi air.", "Lupa na napapalibutan ng tubig."),
    "sea": ("A large body of salt water.", "Perairan asin yang luas.", "Malawak na anyong tubig na maalat."),
    "letter": ("A written message sent to another person.", "Pesan tertulis yang dikirim kepada orang lain.", "Nakasulat na mensaheng ipinapadala sa ibang tao."),
    "door": ("A movable barrier at a room or building entrance.", "Penutup bergerak pada pintu masuk ruangan atau bangunan.", "Naigagalaw na harang sa pasukan ng silid o gusali."),
    "light": ("Brightness that makes things visible.", "Penerangan yang membuat benda terlihat.", "Liwanag na nagbibigay-daan upang makita ang mga bagay."),
    "lamp": ("An object that produces light.", "Benda yang menghasilkan cahaya.", "Bagay na nagbibigay ng liwanag."),
    "storm": ("Severe weather with strong wind and often rain.", "Cuaca buruk dengan angin kencang dan sering hujan.", "Masamang panahon na may malakas na hangin at madalas ay ulan."),
    "message": ("Information communicated to someone.", "Informasi yang disampaikan kepada seseorang.", "Impormasyong ipinahahayag sa isang tao."),
    "lighthouse": ("A coastal tower with a light that guides ships.", "Menara di pantai dengan cahaya untuk memandu kapal.", "Tore sa baybayin na may ilaw upang gabayan ang mga barko."),
    "meal": ("Food eaten at one sitting.", "Makanan yang dimakan dalam satu waktu.", "Pagkaing kinakain sa isang pagkakataon."),
    "surprise": ("Something unexpected that causes a reaction.", "Hal tak terduga yang menimbulkan reaksi.", "Di-inaasahang bagay na nagdudulot ng reaksiyon."),
    "curiosity": ("A desire to learn or discover something.", "Keinginan untuk belajar atau menemukan sesuatu.", "Pagnanais na matuto o makatuklas ng isang bagay."),
    "suspicion": ("A feeling that something may be wrong or untrue.", "Perasaan bahwa sesuatu mungkin salah atau tidak benar.", "Pakiramdam na maaaring may mali o hindi totoo."),
    "uncertainty": ("A lack of confidence about what is true or will happen.", "Kurangnya kepastian tentang kebenaran atau kejadian mendatang.", "Kakulangan ng katiyakan tungkol sa katotohanan o mangyayari."),
    "invitation": ("A request to join an activity or visit.", "Permintaan untuk bergabung dalam kegiatan atau berkunjung.", "Pakiusap na sumali sa gawain o dumalaw."),
    "river": ("A natural stream of water flowing across land.", "Aliran air alami yang mengalir di daratan.", "Likas na daloy ng tubig sa ibabaw ng lupa."),
    "forest": ("A large area covered with trees.", "Wilayah luas yang ditumbuhi pepohonan.", "Malawak na lugar na natatakpan ng mga puno."),
    "plastic": ("A manufactured material that can pollute water when discarded.", "Bahan buatan yang dapat mencemari air jika dibuang.", "Gawang materyal na maaaring magdumi sa tubig kapag itinapon."),
    "water": ("The clear liquid needed by living things.", "Cairan jernih yang dibutuhkan makhluk hidup.", "Malinaw na likidong kailangan ng mga nabubuhay."),
    "birds": ("Animals with feathers, wings, and beaks.", "Hewan dengan bulu, sayap, dan paruh.", "Mga hayop na may balahibo, pakpak, at tuka."),
    "waste": ("Unwanted material that people throw away.", "Bahan tidak terpakai yang dibuang orang.", "Hindi na kailangang materyal na itinatapon ng mga tao."),
    "cleanup": ("An activity to remove dirt or waste from a place.", "Kegiatan membuang kotoran atau sampah dari suatu tempat.", "Gawain upang alisin ang dumi o basura sa isang lugar."),
    "neglect": ("A failure to give something the care it needs.", "Kegagalan memberi perhatian yang dibutuhkan sesuatu.", "Hindi pagbibigay ng kinakailangang pag-aaruga."),
    "effort": ("Work and energy used to achieve a goal.", "Kerja dan tenaga untuk mencapai tujuan.", "Trabaho at lakas na ginagamit upang makamit ang layunin."),
    "contribution": ("Something given to help a shared purpose.", "Sesuatu yang diberikan untuk membantu tujuan bersama.", "Ibinibigay upang makatulong sa isang layuning pinagsasaluhan."),
    "resolve": ("A firm determination to act or continue.", "Tekad kuat untuk bertindak atau melanjutkan.", "Matatag na pagpapasyang kumilos o magpatuloy."),
    "commitment": ("A promise to keep working toward something.", "Janji untuk terus mengusahakan sesuatu.", "Pangakong patuloy na magsisikap para sa isang bagay."),
    "responsibility": ("A duty to care for something or act appropriately.", "Kewajiban merawat sesuatu atau bertindak dengan tepat.", "Tungkuling pangalagaan ang isang bagay o kumilos nang wasto."),
    "persistence": ("Continuing an effort even when it is difficult.", "Terus berusaha meskipun sulit.", "Patuloy na pagsisikap kahit mahirap."),
}

# Contextual overrides for function words and pieces of multiword expressions.
# Indonesian 'rasa ingin tahu' and 'tanggung jawab', for example, are phrases.
OVERRIDES = {
    ("en", "grateful"): ("grateful", "berterima kasih", "nagpapasalamat"),
    ("en", "generosity"): ("generosity", "kemurahan hati", "pagkabukas-palad"),
    ("en", "curiosity"): ("curiosity", "rasa ingin tahu", "pag-uusisa"),
    ("en", "uncertainty"): ("uncertainty", "ketidakpastian", "kawalan ng katiyakan"),
    ("en", "responsibility"): ("responsibility", "tanggung jawab", "pananagutan"),
    ("en", "unsigned"): ("unsigned", "tanpa tanda tangan", "walang lagda"),
    ("en", "indifferent"): ("indifferent", "tak peduli", "walang pakialam"),
    ("en", "unexpected"): ("unexpected", "tak terduga", "di-inaasahang"),
    ("en", "recycled"): ("recycled", "didaur ulang", "ma-recycle"),
    ("en", "rather"): ("rather; instead", "alih-alih", "sa halip"),
    ("tl", "nagpapasalamat"): ("giving thanks; grateful", "berterima kasih", "nagpapasalamat"),
    ("tl", "pagkabukas-palad"): ("generosity", "kemurahan hati", "pagkabukas-palad"),
    ("tl", "pag-uusisa"): ("curiosity", "rasa ingin tahu", "pag-uusisa"),
    ("tl", "pananagutan"): ("responsibility", "tanggung jawab", "pananagutan"),
    ("tl", "lagda"): ("signature", "tanda tangan", "lagda"),
    ("tl", "di-inaasahang"): ("unexpected", "tak terduga", "di-inaasahang"),
    ("tl", "ma-recycle"): ("recycled; recyclable", "didaur ulang", "ma-recycle"),
    ("id", "ketidakpastian"): ("uncertainty", "ketidakpastian", "kawalan ng katiyakan"),
    ("tl", "si"): ("personal name marker", "penanda nama orang", "si"),
    ("tl", "ni"): ("actor or possessor marker", "penanda pelaku atau pemilik", "ni"),
    ("tl", "mga"): ("plural marker", "penanda jamak", "mga"),
    ("tl", "walang"): ("without; no", "tanpa; tidak ada", "walang"),
    ("tl", "pakialam"): ("concern", "kepedulian", "pakialam"),
    ("tl", "kawalan"): ("lack; absence", "ketiadaan", "kawalan"),
    ("id", "rasa"): ("feeling", "rasa", "pakiramdam"),
    ("id", "ingin"): ("want", "ingin", "nais"),
    ("id", "terduga"): ("anticipated", "terduga", "inaasahan"),
    ("id", "tanggung"): ("bear (in tanggung jawab: responsibility)", "tanggung (dalam tanggung jawab)", "pananagutan"),
    ("id", "jawab"): ("answer (in tanggung jawab: responsibility)", "jawab (dalam tanggung jawab)", "sagot"),
    ("id", "berterima"): ("give thanks (with kasih)", "berterima (dengan kasih)", "magpasalamat"),
    ("id", "kasih"): ("kindness; thanks (in terima kasih)", "kasih", "pagmamahal; salamat"),
    ("id", "didaur"): ("recycled (with ulang)", "didaur (dengan ulang)", "ni-recycle"),
    ("id", "kemurahan"): ("generosity (with hati)", "kemurahan", "pagkabukas-palad"),
}
POS_OVERRIDES = {
    ("tl", "ang"): "marker", ("tl", "ng"): "marker", ("tl", "na"): "marker",
    ("tl", "ay"): "marker", ("tl", "pakialam"): "noun", ("tl", "mahalaga"): "adjective",
    ("tl", "kapaligiran"): "noun", ("tl", "nagpapasalamat"): "verb",
    ("id", "berterima"): "verb", ("id", "ingin"): "verb", ("id", "lingkungan"): "noun",
}

# Notes explain grammar rather than pretending every token is a standalone
# concept. Multiword expressions are interpreted together in sentence translation.
NOTES = {
    "noun": ("Names a person, place, thing, or idea. Use the sentence to identify its role.",
             "Menamai orang, tempat, benda, atau gagasan. Lihat perannya dalam kalimat.",
             "Ngalan ng tao, lugar, bagay, o ideya. Tingnan ang papel nito sa pangungusap."),
    "verb": ("Expresses an action or state; the form here follows the story's subject and time.",
             "Menyatakan tindakan atau keadaan; bentuk ini mengikuti subjek dan waktu cerita.",
             "Nagsasaad ng kilos o kalagayan; ang anyo ay ayon sa paksa at panahon ng kuwento."),
    "adjective": ("Describes a noun. Some Tagalog forms include the linking suffix -ng.",
                  "Menjelaskan nomina. Beberapa bentuk Tagalog memakai penghubung -ng.",
                  "Naglalarawan ng pangngalan. May mga anyong gumagamit ng pang-angkop na -ng."),
    "adverb": ("Adds information about time, manner, or degree. Read hyphenated expressions together.",
               "Menambah keterangan waktu, cara, atau tingkat. Baca ungkapan berhubung sebagai satu kesatuan.",
               "Nagdadagdag ng oras, paraan, o antas. Basahin nang buo ang tambalang salita."),
    "pronoun": ("Refers to someone or something already mentioned; possession and reference depend on context.",
                "Merujuk orang atau benda yang disebutkan; kepemilikan dan rujukan bergantung konteks.",
                "Tumutukoy sa tao o bagay na nabanggit; nakabatay sa konteksto ang pagmamay-ari at tinutukoy."),
    "preposition": ("Links words to show place, direction, or relationship; literal equivalents may vary.",
                    "Menghubungkan kata untuk tempat, arah, atau hubungan; padanan harfiah bisa berbeda.",
                    "Nag-uugnay ng lugar, direksiyon, o relasyon; maaaring mag-iba ang literal na katumbas."),
    "conjunction": ("Connects clauses or words. The sentence translation shows the complete relationship.",
                    "Menghubungkan klausa atau kata. Terjemahan kalimat menunjukkan hubungan lengkap.",
                    "Nag-uugnay ng mga sugnay o salita. Ipinapakita ng salin ng pangungusap ang buong ugnayan."),
    "article": ("Marks a noun phrase; Indonesian often omits articles, while Tagalog uses markers.",
                "Menandai frasa nomina; bahasa Indonesia sering tidak memakai artikel, Tagalog memakai penanda.",
                "Pananda ng pariralang pangngalan; madalas walang katumbas na artikulo sa Indonesian."),
    "marker": ("Tagalog si marks a personal name; ni marks an actor or possessor. These have no exact English article equivalent.",
               "Si menandai nama orang; ni menandai pelaku atau pemilik. Tidak ada padanan artikel Inggris yang persis.",
               "Ang si ay pananda ng pangalan; ang ni ay pananda ng gumaganap o may-ari. Walang eksaktong artikulong Ingles na katumbas."),
    "auxiliary": ("Supports the main verb, indicating possibility or grammatical structure.",
                  "Mendukung verba utama, menunjukkan kemungkinan atau struktur tata bahasa.",
                  "Tumutulong sa pangunahing pandiwa upang ipakita ang posibilidad o balarila."),
    "proper noun": ("A person's name. Names stay the same across these languages.",
                    "Nama orang. Nama tetap sama dalam ketiga bahasa ini.",
                    "Pangalan ng tao. Hindi isinasalin ang pangalan sa mga wikang ito."),
    "numeral": ("Expresses a number or an indefinite single item in this sentence.",
                "Menyatakan angka atau satu benda tak tertentu dalam kalimat ini.",
                "Nagsasaad ng bilang o isang bagay na di-tiyak sa pangungusap."),
    "minimal form": ("Part of a hyphenated expression; tap sentence translation for the complete meaning.",
                     "Bagian ungkapan berhubung; ketuk terjemahan kalimat untuk makna lengkap.",
                     "Bahagi ng tambalang salita; basahin ang salin ng pangungusap para sa buong kahulugan."),
}


def build():
    lexicon = {}
    for row in GLOSSARY.strip().splitlines():
        forms = row.split("|")
        assert len(forms) == 4, row
        pos = forms[3]
        glosses = dict(zip(LANGUAGES, [f.split("/")[0] for f in forms[:3]]))
        for language, aliases in zip(LANGUAGES, forms[:3]):
            for word in aliases.split("/"):
                key = language, word.lower()
                if key in lexicon:
                    continue
                translations = dict(zip(LANGUAGES, OVERRIDES[key])) if key in OVERRIDES else glosses
                meanings = dict(zip(LANGUAGES, DEFINITIONS.get(glosses['en'], (
                    f"Contextual {pos}: {glosses['en']}.",
                    f"Makna dalam cerita: {glosses['id']}.",
                    f"Kahulugan sa kuwento: {glosses['tl']}."))))
                if key in OVERRIDES:
                    meanings = {lang: translations[lang] for lang in LANGUAGES}
                local_pos = POS_OVERRIDES.get(key, pos)
                notes = NOTES[local_pos]
                if language == "tl" and local_pos == "marker":
                    notes = (
                        "A Tagalog grammatical marker: si/ni mark names, ang/ng mark noun roles, na links words, and ay introduces a predicate. Its role depends on the sentence.",
                        "Penanda tata bahasa Tagalog: si/ni untuk nama, ang/ng untuk peran nomina, na menghubungkan kata, ay mengawali predikat. Perannya bergantung kalimat.",
                        "Panandang pambalarila: si/ni para sa pangalan, ang/ng para sa papel ng pangngalan, na para sa pag-uugnay, at ay para sa panaguri. Nakabatay sa pangungusap ang papel nito.",
                    )
                lexicon[key] = dict(language=language, word=word.lower(), translations=translations,
                                    meanings=meanings, pos=local_pos, notes=dict(zip(LANGUAGES, notes)))
    missing = set()
    for s in STORIES:
        for sentence in s["sentences"]:
            for language, text in sentence.items():
                for word in re.findall(r"[^\W\d_]+(?:['’-][^\W\d_]+)*", text, re.UNICODE):
                    if (language, word.lower()) not in lexicon:
                        missing.add((language, word.lower()))
    if missing:
        raise ValueError(f"Missing translations: {sorted(missing)}")
    output = ROOT / "app/src/main/assets/corpus.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(dict(version=1, stories=STORIES, lexicon=list(lexicon.values())),
                                 ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Validated {len(STORIES)} story variants, {len(lexicon)} dictionary entries, all three languages.")


if __name__ == "__main__":
    build()
