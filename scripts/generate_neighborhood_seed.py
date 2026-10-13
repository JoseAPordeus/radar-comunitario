import sqlite3
from pathlib import Path

source = Path('database/seeds/PB_bairros_CD2022.gpkg')
target = Path('database/seeds/002_neighborhoods_pb_censo2022.sql')

connection = sqlite3.connect(source)
connection.text_factory = bytes
rows = connection.execute(
    "SELECT NM_MUN, NM_BAIRRO FROM PB_bairros_CD2022 "
    "WHERE NM_BAIRRO IS NOT NULL ORDER BY NM_MUN, NM_BAIRRO"
).fetchall()

def decode(value: bytes) -> str:
    try:
        return value.decode('utf-8').strip()
    except UnicodeDecodeError:
        return value.decode('latin1').strip()

items = sorted({
    (decode(city), decode(neighborhood))
    for city, neighborhood in rows
    if decode(neighborhood)
})

def sql(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"

values = ',\n'.join(f'  ({sql(city)}, {sql(neighborhood)})' for city, neighborhood in items)
target.write_text(
    "-- Fonte: IBGE, Malha de bairros do Censo 2022, Paraíba.\n"
    "-- O arquivo contém 257 bairros em 12 municípios com divisão oficial de bairros.\n"
    "-- Substitua __OWNER_ID__ pelo UUID do usuário em auth.users antes de executar.\n"
    "-- Municípios sem bairro na malha oficial não recebem registros artificiais.\n\n"
    "WITH source(city_name, neighborhood_name) AS (VALUES\n"
    f"{values}\n"
    ")\n"
    "INSERT INTO public.neighborhoods (name, city_id, owner_id)\n"
    "SELECT s.neighborhood_name, c.id, '__OWNER_ID__'::uuid\n"
    "FROM source s\n"
    "JOIN public.cities c ON c.name = s.city_name\n"
    "WHERE NOT EXISTS (\n"
    "  SELECT 1 FROM public.neighborhoods n\n"
    "  WHERE n.owner_id = '__OWNER_ID__'::uuid\n"
    "    AND n.city_id = c.id\n"
    "    AND n.name = s.neighborhood_name\n"
    ");\n",
    encoding='utf-8'
)
print(f'generated={target} rows={len(items)} cities={len(set(city for city, _ in items))}')
