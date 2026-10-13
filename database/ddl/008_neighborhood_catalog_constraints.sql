-- Permite que bairros com o mesmo nome existam em cidades diferentes.
-- Ex.: "Centro" é um nome válido em vários municípios.

DROP INDEX IF EXISTS public.neighborhoods_owner_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS neighborhoods_owner_city_name_unique
  ON public.neighborhoods (owner_id, city_id, name);

-- Códigos confirmados pela malha de bairros do Censo 2022 para os municípios
-- contemplados no arquivo oficial da Paraíba.
UPDATE public.cities SET ibge_code = '2506806' WHERE name = 'Ingá';
UPDATE public.cities SET ibge_code = '2506905' WHERE name = 'Itabaiana';
UPDATE public.cities SET ibge_code = '2507507' WHERE name = 'João Pessoa';
UPDATE public.cities SET ibge_code = '2510808' WHERE name = 'Patos';
UPDATE public.cities SET ibge_code = '2512101' WHERE name = 'Pombal';
UPDATE public.cities SET ibge_code = '2513406' WHERE name = 'Santa Luzia';
UPDATE public.cities SET ibge_code = '2513703' WHERE name = 'Santa Rita';
