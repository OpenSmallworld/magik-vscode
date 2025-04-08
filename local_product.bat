@ECHO off

REM Usage: setp [product name]

REM SET clinkpath=C:\users\roger\Applications\clink_0.4.9

IF [%1]==[] (
    ECHO Missing param.  See local_product -help
    EXIT /B 0
)

IF %1==-help (
    ECHO local_product [product name]
    ECHO Sets the required product environment variables so that magik code will be loaded from your local repo
    ECHO To list current settings:
    ECHO - local_product -print/-p
    ECHO To unset all product directories:
    ECHO - local_product unset
    ECHO To set environment variables for a product choose one of the following: 
    ECHO - core, camdb
    ECHO - gss
    ECHO - co, dm, nrm, sch
    ECHO - eo, gisa, eo_web, eo_ssm
    ECHO - gas, gdo, gto
    ECHO - pni, ftth, lni, ldda, bm, pni_ssm
    ECHO - cmn_smallworld, elec_smallworld_eo_svc
    ECHO - nv [unstable]
    ECHO To set the DB dir to use, excluding ds_admin
    ECHO - local_product db db_path
    EXIT /B 0
)

REM Add products here:

IF %1==unset (
    SET SW_ACE_DB_DIR=
    SET SW_MODELIT_DB_DIR=
    SET SW_CORE_DIR=
    SET CAMBRIDGE_DB_DIR=
    SET SW_COMMON_OFFICE_DIR=
    SET SW_SCHEMATICS_DIR=
    SET SW_DM_DIR=
    SET GSS_DIR=
    SET SERVICE_FRAMEWORK_DIR=
    SET SW_ELECTRIC_OFFICE_DIR=
    SET ELECTRIC_OFFICE_WEB_DIR=
    SET EO_SSM_DIR=
    SET PNI_DIR=
    SET PNI_CUSTOM_DIR=
    SET PNI_SSM_DIR=
    SET PNI_FTTH_DIR=
    SET PNI_FTTH_RESOURCES_DIR=
    SET LNI_DIR=
    SET LDDA_DIR=
    SET LDDA_RESOURCES_DIR=
    SET BEARER_DIR=
    SET NRM_DIR=
    SET NRMB_DIR=
    SET SW_CIM_ADAPTER_DIR=
    SET SW_CIM_ADAPTER_BASE_DIR=
    SET SW_CIM_ADAPTER_SERVER_DIR=
    SET SW_DNOM_ADAPTER_DIR=
    SET SW_DNOM_ADAPTER_BASE_DIR=
    SET SW_DNOM_ADAPTER_SERVER_DIR=
    SET EO_CIM_DIR=
    SET EO_DNOM_DIR=
    SET SW_BASE_GAS_OFFICE_DIR=
    SET SW_GAS_DIST_OFFICE_DIR=
    SET SW_GAS_TRANS_OFFICE_DIR=
    SET GDO_GTO_SYNC_DIR=
    SET NV_DIR=
    SET CMN_SMALLWORLD_DIR=
    SET ELEC_SMALLWORLD_EO_SVC_DIR=
)

IF %1==core (
    SET SW_CORE_DIR=C:/projects/hg/corerepo/sw_core
)
IF %1==camdb (
    SET CAMBRIDGE_DB_DIR=C:/projects/hg/cambridge_db/cambridge_db
)
IF %1==co (
    SET SW_COMMON_OFFICE_DIR=C:/projects/hg/sw_common_office/sw_common_office
)
IF %1==gss (
    SET GSS_DIR=C:/projects/hg/gss/geospatial_server
    SET SERVICE_FRAMEWORK_DIR=C:/projects/hg/gss/service_framework
)
IF %1==dm (
    SET SW_DM_DIR=C:/projects/hg/dm/design_manager
)
IF %1==nrm (
    SET NRM_DIR=C:/projects/hg/nrm/nrm
    SET NRMB_DIR=C:/projects/hg/nrm/nrmb
)
IF %1==sch (
    SET SW_SCHEMATICS_DIR=C:/projects/hg/schematics/schematics
)
IF %1==eo (
    SET SW_ELECTRIC_OFFICE_DIR=C:/projects/hg/eo/electric_office
)
IF %1==eo_ssm (
    SET EO_SSM_DIR=C:/projects/hg/eo_ssm/eo_ssm
)
IF %1==eo_web (
    SET ELECTRIC_OFFICE_WEB_DIR=C:/projects/hg/eo_web/ElectricOfficeWeb
)
IF %1==gisa (
    SET SW_CIM_ADAPTER_BASE_DIR=C:/projects/hg/gis_adapter/sw_cim_adapter_base
    SET SW_CIM_ADAPTER_SERVER_DIR=C:/projects/hg/gis_adapter/sw_cim_adapter_server
    SET SW_CIM_ADAPTER_DIR=C:/projects/hg/gis_adapter/sw_cim_adapter
    SET SW_DNOM_ADAPTER_DIR=C:/projects/hg/gis_adapter/sw_dnom_adapter
    SET SW_DNOM_ADAPTER_BASE_DIR=C:/projects/hg/gis_adapter/sw_dnom_adapter_base
    SET SW_DNOM_ADAPTER_SERVER_DIR=C:/projects/hg/gis_adapter/sw_dnom_adapter_server
    SET EO_CIM_DIR=C:/projects/hg/gis_adapter/eo_cim
    SET EO_DNOM_DIR=C:/projects/hg/gis_adapter/eo_dnom
)
IF %1==gas (
    SET SW_BASE_GAS_OFFICE_DIR=C:/projects/hg/gas_foundation/gas_foundation
    SET SW_GAS_DIST_OFFICE_DIR=C:/projects/hg/gdo/gas_distribution_office
    SET SW_GAS_TRANS_OFFICE_DIR=C:/projects/hg/gto/global_transmission_office
    SET GDO_GTO_SYNC_DIR=C:/projects/hg/gdo_gto_sync/go
)
IF %1==gdo (
    SET SW_BASE_GAS_OFFICE_DIR=C:/projects/hg/gas_foundation/gas_foundation
    SET SW_GAS_DIST_OFFICE_DIR=C:/projects/hg/gdo/gas_distribution_office
    SET GDO_SSM_DIR=C:/projects/hg/gdo_ssm/gdo_ssm
)
IF %1==gto (
    SET SW_BASE_GAS_OFFICE_DIR=C:/projects/hg/gas_foundation/gas_foundation
    SET SW_GAS_TRANS_OFFICE_DIR=C:/projects/hg/gto/global_transmission_office
    SET GTO_SSM_DIR=C:/projects/hg/gto_ssm/gto_ssm
)
IF %1==pni (
    SET PNI_DIR=C:/projects/hg/pni/pni
    SET PNI_CUSTOM_DIR=C:/projects/hg/pni/pni_custom
)
IF %1==pni_ssm (
    SET PNI_SSM_DIR=C:/projects/hg/pni_ssm/pni_ssm
)
IF %1==ftth (
    SET PNI_FTTH_DIR=C:/projects/hg/ftth/pni_ftth
    SET PNI_FTTH_RESOURCES_DIR=C:/projects/hg/ftth/pni_ftth_resources
)
IF %1==lni (
    SET LNI_DIR=C:/projects/hg/lni/lni
)
IF %1==ldda (
    SET LDDA_DIR=C:/projects/hg/pni_ldda/pni_ldda
    SET LDDA_RESOURCES_DIR=C:/projects/hg/pni_ldda/pni_ldda_resources
)
IF %1==bm (
    SET BEARER_DIR=C:/projects/hg/bm/bearer
)
IF %1==db (
    SET SW_ACE_DB_DIR=%2/ds_admin
    SET SW_MODELIT_DB_DIR=%2
)
IF %1==nv (
    SET NV_DIR=C:/projects/hg/network_viewer/CamDB_NetworkViewer
)
IF %1==cmn_smallworld (
    SET CMN_SMALLWORLD_DIR=C:/projects/hg/gnm-data-services-magik/cmn_smallworld
)
IF %1==elec_smallworld_eo_svc (
    SET CMN_SMALLWORLD_DIR=C:/projects/hg/gnm-data-services-magik/cmn_smallworld
    SET ELEC_SMALLWORLD_EO_SVC_DIR=C:/projects/hg/gnm-data-services-magik/elec_smallworld_eo_svc
)

ECHO Local Products:
set none="true"
IF not "%SW_CORE_DIR%" == "" (
    set none="false"
    ECHO SW_CORE_DIR - %SW_CORE_DIR%
)
IF not "%CAMBRIDGE_DB_DIR%" == "" (
    set none="false"
    ECHO CAMBRIDGE_DB_DIR - %CAMBRIDGE_DB_DIR%
)
IF not "%SW_COMMON_OFFICE_DIR%" == "" (
    set none="false"
    ECHO SW_COMMON_OFFICE_DIR - %SW_COMMON_OFFICE_DIR%
)
IF not "%SW_SCHEMATICS_DIR%" == "" (
    set none="false"
    ECHO SW_SCHEMATICS_DIR - %SW_SCHEMATICS_DIR%
)
IF not "%SW_DM_DIR%" == "" (
    set none="false"
    ECHO SW_DM_DIR - %SW_DM_DIR%
)
IF not "%SW_ELECTRIC_OFFICE_DIR%" == "" (
    set none="false"
    ECHO SW_ELECTRIC_OFFICE_DIR - %SW_ELECTRIC_OFFICE_DIR%
)
IF not "%EO_SSM_DIR%" == "" (
    set none="false"
    ECHO EO_SSM_DIR - %EO_SSM_DIR%
)
IF not "%ELECTRIC_OFFICE_WEB_DIR%" == "" (
    set none="false"
    ECHO ELECTRIC_OFFICE_WEB_DIR - %ELECTRIC_OFFICE_WEB_DIR%
)
IF not "%PNI_DIR%" == "" (
    set none="false"
    ECHO PNI_DIR - %PNI_DIR%
)
IF not "%PNI_CUSTOM_DIR%" == "" (
    set none="false"
    ECHO PNI_CUSTOM_DIR - %PNI_CUSTOM_DIR%
)
IF not "%PNI_SSM_DIR%" == "" (
    set none="false"
    ECHO PNI_SSM_DIR - %PNI_SSM_DIR%
)
IF not "%PNI_FTTH_DIR%" == "" (
    set none="false"
    ECHO PNI_FTTH_DIR - %PNI_FTTH_DIR%
)
IF not "%PNI_FTTH_RESOURCES_DIR%" == "" (
    set none="false"
    ECHO PNI_FTTH_RESOURCES_DIR - %PNI_FTTH_RESOURCES_DIR%
)
IF not "%LNI_DIR%" == "" (
    set none="false"
    ECHO LNI_DIR - %LNI_DIR%
)
IF not "%LDDA_DIR%" == "" (
    set none="false"
    ECHO LDDA_DIR - %LDDA_DIR%
)
IF not "%LDDA_RESOURCES_DIR%" == "" (
    set none="false"
    ECHO LDDA_RESOURCES_DIR - %LDDA_RESOURCES_DIR%
)
IF not "%BEARER_DIR%" == "" (
    set none="false"
    ECHO BEARER_DIR - %BEARER_DIR%
)
IF not "%NRM_DIR%" == "" (
    set none="false"
    ECHO NRM_DIR - %NRM_DIR%
)
IF not "%NRMB_DIR%" == "" (
    set none="false"
    ECHO NRMB_DIR - %NRMB_DIR%
)
IF not "%SW_CIM_ADAPTER_BASE_DIR%" == "" (
    set none="false"
    ECHO SW_CIM_ADAPTER_BASE_DIR - %SW_CIM_ADAPTER_BASE_DIR%
)
IF not "%SW_CIM_ADAPTER_SERVER_DIR%" == "" (
    set none="false"
    ECHO SW_CIM_ADAPTER_SERVER_DIR - %SW_CIM_ADAPTER_SERVER_DIR%
)
IF not "%SW_CIM_ADAPTER_DIR%" == "" (
    set none="false"
    ECHO SW_CIM_ADAPTER_DIR - %SW_CIM_ADAPTER_DIR%
)
IF not "%SW_DNOM_ADAPTER_DIR%" == "" (
    set none="false"
    ECHO SW_DNOM_ADAPTER_DIR - %SW_DNOM_ADAPTER_DIR%
)
IF not "%SW_DNOM_ADAPTER_BASE_DIR%" == "" (
    set none="false"
    ECHO SW_DNOM_ADAPTER_BASE_DIR - %SW_DNOM_ADAPTER_BASE_DIR%
)
IF not "%SW_DNOM_ADAPTER_SERVER_DIR%" == "" (
    set none="false"
    ECHO SW_DNOM_ADAPTER_SERVER_DIR - %SW_DNOM_ADAPTER_SERVER_DIR%
)
IF not "%EO_CIM_DIR%" == "" (
    set none="false"
    ECHO EO_CIM_DIR - %EO_CIM_DIR%
)
IF not "%EO_DNOM_DIR%" == "" (
    set none="false"
    ECHO EO_DNOM_DIR - %EO_DNOM_DIR%
)
IF not "%SW_BASE_GAS_OFFICE_DIR%" == "" (
    set none="false"
    ECHO SW_BASE_GAS_OFFICE_DIR - %SW_BASE_GAS_OFFICE_DIR%
)
IF not "%SW_GAS_DIST_OFFICE_DIR%" == "" (
    set none="false"
    ECHO SW_GAS_DIST_OFFICE_DIR - %SW_GAS_DIST_OFFICE_DIR%
)
IF not "%SW_GAS_TRANS_OFFICE_DIR%" == "" (
    set none="false"
    ECHO SW_GAS_TRANS_OFFICE_DIR - %SW_GAS_TRANS_OFFICE_DIR%
)
IF not "%GDO_GTO_SYNC_DIR%" == "" (
    set none="false"
    ECHO GDO_GTO_SYNC_DIR - %GDO_GTO_SYNC_DIR%
)
IF not "%GSS_DIR%" == "" (
    set none="false"
    ECHO GSS_DIR - %GSS_DIR%
)
IF not "%SERVICE_FRAMEWORK_DIR%" == "" (
    set none="false"
    ECHO SERVICE_FRAMEWORK_DIR - %SERVICE_FRAMEWORK_DIR%
)
IF not "%SW_ACE_DB_DIR%" == "" (
    set none="false"
    ECHO SW_ACE_DB_DIR - %SW_ACE_DB_DIR%
)
IF not "%SW_MODELIT_DB_DIR%" == "" (
    set none="false"
    ECHO SW_MODELIT_DB_DIR - %SW_MODELIT_DB_DIR%
)
IF not "%NV_DIR%" == "" (
    set none="false"
    ECHO NV_DIR - %NV_DIR%
)
IF not "%CMN_SMALLWORLD_DIR%" == "" (
    set none="false"
    ECHO ELEC_SMALLWORLD_EO_SVC_DIR - %ELEC_SMALLWORLD_EO_SVC_DIR%
    ECHO CMN_SMALLWORLD_DIR - %CMN_SMALLWORLD_DIR%
)

IF %none% == "true" (
    ECHO None
)
EXIT /B 0
