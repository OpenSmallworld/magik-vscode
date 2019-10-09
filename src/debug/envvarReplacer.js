'use strict';

const envVarDefaults = {
  SMALLWORLD_GIS: 'C:/projects/hg/corerepo',
  SW_COMMON_OFFICE_DIR: 'C:/projects/hg/sw_common_office/sw_common_office',
  SW_ELECTRIC_OFFICE_DIR: 'C:/projects/hg/eo/electric_office',
  SW_DM_DIR: 'C:/projects/hg/dm/design_manager',
  SOMS_DIR: 'C:/projects/hg/soms/soms',
  PNI_DIR: 'C:/projects/hg/pni/pni',
  PNI_FTTH_DIR: 'C:/projects/hg/ftth/pni_ftth',
  BEARER_DIR: 'C:/projects/hg/bm/bearer',
  SW_SCHEMATICS_DIR: 'C:/projects/hg/schematics/schematics',
  NRM_DIR: 'C:/projects/hg/nrm/nrm',
  OFFICE_CYMDIST_DIR: 'C:/projects/hg/cymdist/CYMDist_Office',
  SW_GO_DIR: 'C:/projects/hg/gdo_gto_sync/go',
  SW_GAS_TRANS_OFFICE_DIR: 'C:/projects/hg/gto/global_transmission_office',
  SW_GAS_DIST_OFFICE_DIR: 'C:/projects/hg/gdo/gas_distribution_office',
  SW_BASE_GAS_OFFICE_DIR: 'C:/projects/hg/gas_foundation/gas_foundation',
  EO_CIM_DIR: 'C:/projects/hg/gis_adapter/eo_cim',
  SW_CIM_ADAPTER_DIR: 'C:/projects/hg/gis_adapter',
  FME_DIR: 'C:/projects/hg/fme/fme',
  SW_DXF_DIR: 'C:/projects/hg/dxf/dxf',
  LNI_DIR: 'C:/projects/hg/lni/lni'
};

function replace(string, vars) {
  return string.replace(/\$(\w+)/g, (full, envvar) => vars[envvar] || envVarDefaults[envvar] || full);
}

module.exports = {replace};
