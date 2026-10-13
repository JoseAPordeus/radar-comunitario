-- Catálogo dos municípios da Paraíba e vínculo dos bairros ao município.
-- Fonte do catálogo: IBGE (223 municípios da Paraíba).

CREATE TABLE IF NOT EXISTS cities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ibge_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  state_uf CHAR(2) NOT NULL DEFAULT 'PB' CHECK (state_uf = 'PB'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE neighborhoods
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES cities(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS neighborhoods_city_idx ON neighborhoods (city_id);

-- Catálogo inicial da Paraíba. O código IBGE evita ambiguidade e permite
-- integrações futuras com endereço/geocodificação.
INSERT INTO cities (ibge_code, name)
VALUES
  ('2500106', 'Água Branca'), ('2500205', 'Aguiar'), ('2500304', 'Alagoa Grande'),
  ('2500403', 'Alagoa Nova'), ('2500502', 'Alagoinha'), ('2500536', 'Alcantil'),
  ('2500577', 'Algodão de Jandaíra'), ('2500601', 'Alhandra'), ('2500734', 'Amparo'),
  ('2500775', 'Aparecida'), ('2500809', 'Araçagi'), ('2500908', 'Arara'),
  ('2501005', 'Araruna'), ('2501104', 'Areia'), ('2501153', 'Areia de Baraúnas'),
  ('2501203', 'Areial'), ('2501302', 'Aroeiras'), ('2501351', 'Assunção'),
  ('2501401', 'Baía da Traição'), ('2501500', 'Bananeiras'), ('2501534', 'Baraúna'),
  ('2501609', 'Barra de Santa Rosa'), ('2501575', 'Barra de Santana'),
  ('2501708', 'Barra de São Miguel'), ('2501807', 'Bayeux'), ('2501906', 'Belém'),
  ('2502003', 'Belém do Brejo do Cruz'), ('2502052', 'Bernardino Batista'),
  ('2502102', 'Boa Ventura'), ('2502151', 'Boa Vista'), ('2502201', 'Bom Jesus'),
  ('2502300', 'Bom Sucesso'), ('2502409', 'Bonito de Santa Fé'), ('2502508', 'Boqueirão'),
  ('2502706', 'Borborema'), ('2502805', 'Brejo do Cruz'), ('2502904', 'Brejo dos Santos'),
  ('2503001', 'Caaporã'), ('2503100', 'Cabaceiras'), ('2503209', 'Cabedelo'),
  ('2503308', 'Cachoeira dos Índios'), ('2503407', 'Cacimba de Areia'),
  ('2503506', 'Cacimba de Dentro'), ('2503555', 'Cacimbas'), ('2503605', 'Caiçara'),
  ('2503704', 'Cajazeiras'), ('2503753', 'Cajazeirinhas'), ('2503803', 'Caldas Brandão'),
  ('2503902', 'Camalaú'), ('2504009', 'Campina Grande'), ('2504033', 'Capim'),
  ('2504074', 'Caraúbas'), ('2504108', 'Carrapateira'), ('2504157', 'Casserengue'),
  ('2504207', 'Catingueira'), ('2504306', 'Catolé do Rocha'), ('2504355', 'Caturité'),
  ('2504405', 'Conceição'), ('2504504', 'Condado'), ('2504603', 'Conde'),
  ('2504702', 'Congo'), ('2504801', 'Coremas'), ('2504850', 'Coxixola'),
  ('2504900', 'Cruz do Espírito Santo'), ('2505006', 'Cubati'), ('2505105', 'Cuité'),
  ('2505238', 'Cuité de Mamanguape'), ('2505204', 'Cuitegi'), ('2505279', 'Curral de Cima'),
  ('2505303', 'Curral Velho'), ('2505352', 'Damião'), ('2505402', 'Desterro'),
  ('2505608', 'Diamante'), ('2505707', 'Dona Inês'), ('2505806', 'Duas Estradas'),
  ('2505905', 'Emas'), ('2506002', 'Esperança'), ('2506101', 'Fagundes'),
  ('2506200', 'Frei Martinho'), ('2506259', 'Gado Bravo'), ('2506309', 'Guarabira'),
  ('2506408', 'Gurinhém'), ('2506507', 'Gurjão'), ('2506606', 'Ibiara'),
  ('2506705', 'Igaracy'), ('2506804', 'Imaculada'), ('2506903', 'Ingá'),
  ('2507000', 'Itabaiana'), ('2507109', 'Itaporanga'), ('2507158', 'Itapororoca'),
  ('2507208', 'Itatuba'), ('2507307', 'Jacaraú'), ('2507406', 'Jericó'),
  ('2507505', 'João Pessoa'), ('2507554', 'Joca Claudino'), ('2507604', 'Juarez Távora'),
  ('2507703', 'Juazeirinho'), ('2507802', 'Junco do Seridó'), ('2507901', 'Juripiranga'),
  ('2508008', 'Juru'), ('2508107', 'Lagoa'), ('2508206', 'Lagoa de Dentro'),
  ('2508305', 'Lagoa Seca'), ('2508404', 'Lastro'), ('2508503', 'Livramento'),
  ('2508552', 'Logradouro'), ('2508602', 'Lucena'), ('2508701', 'Mãe d''Água'),
  ('2508800', 'Malta'), ('2508909', 'Mamanguape'), ('2509006', 'Manaíra'),
  ('2509055', 'Marcação'), ('2509105', 'Mari'), ('2509154', 'Marizópolis'),
  ('2509204', 'Massaranduba'), ('2509303', 'Mataraca'), ('2509337', 'Matinhas'),
  ('2509378', 'Mato Grosso'), ('2509394', 'Maturéia'), ('2509402', 'Mogeiro'),
  ('2509501', 'Montadas'), ('2509600', 'Monte Horebe'), ('2509709', 'Monteiro'),
  ('2509808', 'Mulungu'), ('2509907', 'Natuba'), ('2510004', 'Nazarezinho'),
  ('2510103', 'Nova Floresta'), ('2510202', 'Nova Olinda'), ('2510301', 'Nova Palmeira'),
  ('2510400', 'Olho d''Água'), ('2510509', 'Olivedos'), ('2510608', 'Ouro Velho'),
  ('2510657', 'Parari'), ('2510707', 'Passagem'), ('2510806', 'Patos'),
  ('2510905', 'Paulista'), ('2511002', 'Pedra Branca'), ('2511101', 'Pedra Lavrada'),
  ('2511200', 'Pedras de Fogo'), ('2512729', 'Pedro Régis'), ('2511309', 'Piancó'),
  ('2511408', 'Picuí'), ('2511507', 'Pilar'), ('2511606', 'Pilões'),
  ('2511705', 'Pilõezinhos'), ('2511804', 'Pirpirituba'), ('2511903', 'Pitimbu'),
  ('2512000', 'Pocinhos'), ('2512034', 'Poço Dantas'), ('2512075', 'Poço de José de Moura'),
  ('2512109', 'Pombal'), ('2512208', 'Prata'), ('2512307', 'Princesa Isabel'),
  ('2512406', 'Puxinanã'), ('2512505', 'Queimadas'), ('2512604', 'Quixaba'),
  ('2512703', 'Remígio'), ('2512760', 'Riachão'), ('2512786', 'Riachão do Bacamarte'),
  ('2512802', 'Riachão do Poço'), ('2512901', 'Riacho de Santo Antônio'),
  ('2513008', 'Riacho dos Cavalos'), ('2513107', 'Rio Tinto'), ('2513156', 'Salgadinho'),
  ('2513206', 'Salgado de São Félix'), ('2513305', 'Santa Cecília'), ('2513354', 'Santa Cruz'),
  ('2513404', 'Santa Helena'), ('2513503', 'Santa Inês'), ('2513602', 'Santa Luzia'),
  ('2513701', 'Santa Rita'), ('2513800', 'Santa Teresinha'), ('2513909', 'Santana de Mangueira'),
  ('2513933', 'Santana dos Garrotes'), ('2513851', 'Santo André'), ('2513927', 'São Bentinho'),
  ('2513901', 'São Bento'), ('2513968', 'São Domingos'), ('2513943', 'São Domingos do Cariri'),
  ('2513984', 'São Francisco'), ('2514008', 'São João do Cariri'), ('2500700', 'São João do Rio do Peixe'),
  ('2514107', 'São João do Tigre'), ('2514206', 'São José da Lagoa Tapada'),
  ('2514305', 'São José de Caiana'), ('2514404', 'São José de Espinharas'),
  ('2514503', 'São José de Piranhas'), ('2514552', 'São José de Princesa'),
  ('2514602', 'São José do Bonfim'), ('2514651', 'São José do Brejo do Cruz'),
  ('2514701', 'São José do Sabugi'), ('2514800', 'São José dos Cordeiros'),
  ('2514453', 'São José dos Ramos'), ('2514909', 'São Mamede'), ('2515005', 'São Miguel de Taipu'),
  ('2515104', 'São Sebastião de Lagoa de Roça'), ('2515203', 'São Sebastião do Umbuzeiro'),
  ('2515401', 'São Vicente do Seridó'), ('2515302', 'Sapé'), ('2515500', 'Serra Branca'),
  ('2515609', 'Serra da Raiz'), ('2515708', 'Serra Grande'), ('2515807', 'Serra Redonda'),
  ('2515906', 'Serraria'), ('2515930', 'Sertãozinho'), ('2515971', 'Sobrado'),
  ('2516003', 'Solânea'), ('2516102', 'Soledade'), ('2516151', 'Sossêgo'),
  ('2516201', 'Sousa'), ('2516300', 'Sumé'), ('2516409', 'Tacima'), ('2516508', 'Taperoá'),
  ('2516607', 'Tavares'), ('2516706', 'Teixeira'), ('2516755', 'Tenório'),
  ('2516805', 'Triunfo'), ('2516904', 'Uiraúna'), ('2517001', 'Umbuzeiro'),
  ('2517100', 'Várzea'), ('2517209', 'Vieirópolis'), ('2505501', 'Vista Serrana'),
  ('2517407', 'Zabelê')
ON CONFLICT (ibge_code) DO UPDATE SET name = EXCLUDED.name, state_uf = EXCLUDED.state_uf;

ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cities_authenticated_read ON cities;
CREATE POLICY cities_authenticated_read ON cities
  FOR SELECT TO authenticated USING (true);
