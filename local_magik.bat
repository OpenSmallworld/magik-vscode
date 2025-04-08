@ECHO off
SetLocal EnableDelayedExpansion

REM Script to launch a Magik session from a deployment in a VS Code terminal.
REM This script will search for latest installation from the last 14 days.

REM Installation:
REM 1. Ensure that the directory for this script is in your PATH

REM Configuration:
REM 2. Update the aliases below to include your sessions. (see Session Aliases:)
REM 3. Update the default version and session as required.

REM Usage:
REM local_magik [alias name] [?-debug] [?-java_debug] [?-days=] [?-version=] [?-vvmds] [?-no_login] [?-noinit] [-use_s] [?-print]
REM e.g. > local_magik cam
REM e.g. > local_magik pni -debug
REM e.g. > local_magik pni_no_db -version 531 -days 260

REM Default location of git repositories
IF NOT DEFINED PROJECTS_DIR (
        ECHO Setting PROJECTS_DIR to C:\projects\hg
        SET PROJECTS_DIR=C:\projects\hg
        )

REM Local installation path:
SET target=C:\Smallworld

REM Default session:
SET version=600
SET alias_dir=unset
SET alias=unset

REM Set defaults
FOR /f "usebackq tokens=1,2,3 delims=/" %%a IN ('%date%') DO (
    SET build_date=%%c-%%b-%%a\
)
SET print=0
SET day=0
SET runalias_path=null
SET alias_path=null
SET debug_path=
SET java_debugger=

IF [%1]==[] GOTO date

IF %1==-help (
    ECHO local_magik [alias name] [?-debug] [?-days=] [?-version=] [?-vvmds] [?-no_login] [?-noinit] [?-use_s] [?-print]
    ECHO Arguments:
    ECHO  -debug       - enable debugger
    ECHO  -java_debug  - enable Java debugging
    ECHO  -version=NNN - choose a different version from the default which is %version%
    ECHO  -days=N      - run a version from n days ago
    ECHO  -vvmds       - run in VVMDS mode
    ECHO  -noinit      - do not open the database
    ECHO  -no_login    - do not login
    ECHO  -use_s       - Run the latest deployment on the S drive
    ECHO  -print       - just write out the runalias command
    ECHO Available sessions: 
    ECHO - base - for the core closed base session
    ECHO - swaf - for the core closed swaf session
    ECHO - cam, cambridge_db, cam_vmsql, camdb_vmsql
    ECHO - sch
    ECHO - dm
    ECHO - pni, pni_vmsql, pni_custom, ftth, ftth_vmsql, ftth_custom, lni, ldda, bm. pni_nu, pni_me
    ECHO - eo, eo_vmsql, eo_suite, eo_plotting, cbyd, cymdist, eo_job_server, eo_nu, eo_ssm
    ECHO - eo_cim_poa_eg, eo_cim_poa_gisa, eo_cim_std_eg, eo_cim_std_gisa, eo_dnom_eg, eo_dnom_gisa
    ECHO - gdo, gto, gdo_wm, gto_wm, go, gdo_ssm, gto_ssm
    ECHO - nrm, nrmb
    ECHO - cmn_smallworld, elec_smallworld_eo_svc
    ECHO - nv - closed session - under development
    ECHO With the exception of base and swaf, all the above start a session open on the installed database
    ECHO Add a _closed suffix to start the corresponding closed session
    ECHO _open suffix can also be used but this is the same as with no suffix
    EXIT /B 0
)

SET input_alias=%1
SHIFT

:params
IF [%1]==[] GOTO set_alias
IF %1==-debug (
    SET debug_path= -j -agentpath:%target%\SW%version%\%build_date%core\bin\x86\mda.dll
    SHIFT
    GOTO params
)

IF %1==-java_debug (
    SET java_debugger= -j -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005
    SHIFT
    GOTO params
)

IF %1==-print (
    SET print=1
    SHIFT
    GOTO params
)
IF %1==-version (
    SET version=%2
    ECHO setting version to %2
    SHIFT
    SHIFT
    GOTO params
)
IF %1==-vvmds (
    SET vvmds=-vvmds
    SHIFT
    GOTO params
)
IF %1==-noinit (
    SET noinit=-noinit
    SHIFT
    GOTO params
)
IF %1==-no_login (
    SET login=
    SHIFT
    GOTO params
)
IF %1==-use_s (
    SET target=S:
    SHIFT
    GOTO params
)
IF %1==-days (
    SET day=-%2
    SHIFT
    SHIFT
    GOTO params
)
SHIFT
GOTO params


REM Session Aliases:
:set_alias
IF %input_alias%==base (
    SET alias_dir=core
    SET alias=base
)

IF %input_alias%==swaf (
    SET alias_dir=core
    SET alias=swaf
)

FOR %%a in (cam cam_open camdb camdb_open) DO IF %input_alias%==%%a (
    SET alias_dir=cambridge_db
    SET alias=cambridge_db_open
)

FOR %%a in (cam_vmsql camdb_vmsql) DO IF %input_alias%==%%a (
    SET alias_dir=cambridge_db
    SET alias=cambridge_db_vmsql
)

FOR %%a in (cam_closed camdb_closed) DO IF %input_alias%==%%a (
    SET alias_dir=cambridge_db
    SET alias=cambridge_db
)

FOR %%a in (sch sch_open) DO IF %input_alias%==%%a (
    SET alias_dir=schematics
    SET alias=schematics_open
)
IF %input_alias%==sch_closed (
    SET alias_dir=schematics
    SET alias=schematics
)

FOR %%a in (dm dm_open) DO IF %input_alias%==%%a (
    SET alias_dir=design_manager
    SET alias=dm_open
)

FOR %%a in (dm_vmsql dm_vmsql) DO IF %input_alias%==%%a (
    SET alias_dir=design_manager
    SET alias=dm_vmsql
)

IF %input_alias%==dm_closed (
    SET alias_dir=design_manager
    SET alias=dm
)

FOR %%a in (pni pni_open) DO IF %input_alias%==%%a (
    SET alias_dir=pni
    SET alias=pni_open
)

FOR %%a in (pni_vmsql) DO IF %input_alias%==%%a (
    SET alias_dir=pni
    SET alias=pni_vmsql
)
FOR %%a in (pni_no_db) DO IF %input_alias%==%%a (
    SET alias=pni_open_no_db
    SET alias_path=%PROJECTS_DIR%\pni\pni_testing\config\gis_aliases
    IF "%SW_MODELIT_DB_DIR%" == "" (
        SET DEFAULT_DB_DIR=TRUE
        SET SW_MODELIT_DB_DIR=/../pni/example_db/ds
    )
)
FOR %%a in (pni_ssm pni_ssm_open) DO IF %input_alias%==%%a (
    SET PNI_SSM_TEST_DIR=%PROJECTS_DIR%\pni_ssm\tests
    SET RABBIT_CONFIG_MODULE_NAME=gss_basic_vertx_application
    SET RABBIT_CONFIG_FILE_NAME=empty_rabbit_config.xml
    SET alias_path=%PROJECTS_DIR%\pni_ssm\tests\config\gis_aliases
    SET alias=pni_ssm_test_no_db
    IF "%SW_MODELIT_DB_DIR%" == "" (
        SET DEFAULT_DB_DIR=TRUE
        SET SW_MODELIT_DB_DIR=/../pni/example_db/ds
    )
)
FOR %%a in (pni_nu) DO IF %input_alias%==%%a (
    SET RABBIT_CONFIG_MODULE_NAME=pni_network_update_application
    SET RABBIT_CONFIG_FILE_NAME=ssm_extraction.xml
    SET alias_dir=pni_ssm
    SET alias=pni_nu_open
    IF "%SW_MODELIT_DB_DIR%" == "" (
        SET DEFAULT_DB_DIR=TRUE
        SET SW_MODELIT_DB_DIR=/../pni/example_db/ds
    )
)
FOR %%a in (pni_me) DO IF %input_alias%==%%a (
    ECHO Starting ME
    SET RABBIT_CONFIG_MODULE_NAME=pni_mobile_application
    SET RABBIT_CONFIG_FILE_NAME=ssm_extraction.xml
    SET alias_dir=pni_ssm
    SET alias=pni_mobile_open
    IF "%SW_MODELIT_DB_DIR%" == "" (
        SET DEFAULT_DB_DIR=TRUE
        SET SW_MODELIT_DB_DIR=/../pni/example_db/ds
    )
)
IF %input_alias%==pni_closed (
    SET alias_dir=pni
    SET alias=pni
)
FOR %%a in (pni_custom pni_custom_open) DO IF %input_alias%==%%a (
    SET alias_dir=pni
    SET alias=pni_custom_open
)
IF %input_alias%==pni_custom_closed (
    SET alias_dir=pni
    SET alias=pni_custom
)

FOR %%a in (ftth ftth_open) DO IF %input_alias%==%%a (
    SET alias_dir=pni_ftth
    SET alias=ftth_open
)

FOR %%a in (ftth_vmsql) DO IF %input_alias%==%%a (
    SET alias_dir=pni_ftth
    SET alias=ftth_vmsql
)
IF %input_alias%==ftth_closed (
    SET alias_dir=pni_ftth
    SET alias=ftth
)
FOR %%a in (ftth_custom ftth_custom_open) DO IF %input_alias%==%%a (
    SET alias_dir=pni_ftth
    SET alias=ftth_custom_open
)
IF %input_alias%==ftth_custom_closed (
    SET alias_dir=pni_ftth
    SET alias=ftth_custom
)

FOR %%a in (lni lni_open) DO IF %input_alias%==%%a (
    SET alias_dir=lni
    SET alias=lni_open
)
IF %input_alias%==lni_closed (
    SET alias_dir=lni
    SET alias=lni
)

FOR %%a in (bm bm_open) DO IF %input_alias%==%%a (
    SET alias_dir=bearer
    SET alias=bearer_custom_open_cli
)
IF %input_alias%==bm_closed (
    SET alias_dir=bearer
    SET alias=bearer_custom_cli
)

FOR %%a in (ldda ldda_open) DO IF %input_alias%==%%a (
    SET alias_dir=pni_ldda
    SET alias=ldda_open
)
IF %input_alias%==ldda_closed (
    SET alias_dir=pni_ldda
    SET alias=ldda
)

FOR %%a in (eo eo_open) DO IF %input_alias%==%%a (
    SET alias=eo_open_no_db
    SET alias_path=%PROJECTS_DIR%\eo\tests\config\gis_aliases
    IF "%SW_ACE_DB_DIR%" == "" (
        SET DEFAULT_DB_DIR=TRUE
        SET SW_ACE_DB_DIR=/../electric_office/example_db/ds/ds_admin
    )
)

FOR %%a in (eo_vmsql) DO IF %input_alias%==%%a (
    SET alias=eo_vmsql
    SET alias_path=%PROJECTS_DIR%\eo\tests\config\gis_aliases
)

IF %input_alias%==eo_closed (
    SET alias_dir=electric_office
    SET alias=eo
)
FOR %%a in (eo_suite eo_suite_open) DO IF %input_alias%==%%a (
    SET alias_dir=electric_office
    SET alias=eo_suite_open
)
IF %input_alias%==eo_suite_closed (
    SET alias_dir=electric_office
    SET alias=eo_suite
)
IF %input_alias%==eo_job_server (
    SET alias_dir=electric_office
    SET alias=eo_job_server
)
FOR %%a in (eo_nu) DO IF %input_alias%==%%a (
    SET RABBIT_CONFIG_MODULE_NAME=eo_network_update_application
    SET RABBIT_CONFIG_FILE_NAME=ssm_extraction.xml
    SET alias_path=%PROJECTS_DIR%\eo_ssm\tests\config\gis_aliases
    SET alias=eo_nu_dev_no_db
    IF "%SW_ACE_DB_DIR%" == "" (
        SET DEFAULT_DB_DIR=TRUE
        SET SW_ACE_DB_DIR=/../electric_office/example_db/ds/ds_admin
    )
)
FOR %%a in (cmn_smallworld) DO IF %input_alias%==%%a (
    set GSS_LOGGING_LEVEL=info
    SET alias_path=%PROJECTS_DIR%\gnm-data-services-magik\cmn_smallworld\config\gis_aliases
    SET alias_dir=cmn_smallworld
    SET alias=cmn_smallworld_open_camdb
    set HOST_URL=http://localhost:3001
    SET SPRING_KAFKA_BOOTSTRAPSERVERS=127.0.0.1:9092
    SET CONSUMER_GROUP_ID=elec-smallworld-eo-svc
    SET CONSUMER_TIMEOUT=60
    SET SPRING_KAFKA_SECURITY_PROTOCOL=PLAINTEXT
    REM the SSL setup below is irrelevant if using the PLAINTEXT, and the mentioned files are not required to actually exist, however the env variables are mandatory to be set
    SET SPRING_KAFKA_SSL_KEYSTORETYPE=PKCS12
    SET SPRING_KAFKA_SSL_KEYSTORELOCATION=file:///C:/projects/kafka_certs/user.p12
    SET SPRING_KAFKA_SSL_KEYSTOREPASSWORD=USER_PASSWORD_PLACEHOLDER
    SET SPRING_KAFKA_SSL_TRUSTSTORETYPE=PKCS12
    SET SPRING_KAFKA_SSL_TRUSTSTORELOCATION=file:///C:/projects/kafka_certs/ca.p12
    SET SPRING_KAFKA_SSL_TRUSTSTOREPASSWORD=CA_PASSWORD_PLACEHOLDER
    IF "%SW_ACE_DB_DIR%" == "" (
        SET DEFAULT_DB_DIR=TRUE
        SET SW_ACE_DB_DIR=\..\cambridge_db\ds\ds_admin
    )    
)
FOR %%a in (elec_smallworld_eo_svc) DO IF %input_alias%==%%a (
    set GSS_LOGGING_LEVEL=info
    SET alias_path=%PROJECTS_DIR%\gnm-data-services-magik\elec_smallworld_eo_svc\config\gis_aliases
    SET alias_dir=elec_smallworld_eo_svc
    SET alias=elec_smallworld_eo_svc_no_db
    set HOST_URL=http://localhost:3001
    SET SPRING_KAFKA_BOOTSTRAPSERVERS=127.0.0.1:9092
    SET CONSUMER_GROUP_ID=elec-smallworld-eo-svc
    SET CONSUMER_TIMEOUT=60
    SET SPRING_KAFKA_SECURITY_PROTOCOL=PLAINTEXT
    REM the SSL setup below is irrelevant if using the PLAINTEXT, and the mentioned files are not required to actually exist, however the env variables are mandatory to be set
    SET SPRING_KAFKA_SSL_KEYSTORETYPE=PKCS12
    SET SPRING_KAFKA_SSL_KEYSTORELOCATION=file:///C:/projects/kafka_certs/user.p12
    SET SPRING_KAFKA_SSL_KEYSTOREPASSWORD=USER_PASSWORD_PLACEHOLDER
    SET SPRING_KAFKA_SSL_TRUSTSTORETYPE=PKCS12
    SET SPRING_KAFKA_SSL_TRUSTSTORELOCATION=file:///C:/projects/kafka_certs/ca.p12
    SET SPRING_KAFKA_SSL_TRUSTSTOREPASSWORD=CA_PASSWORD_PLACEHOLDER
    IF "%SW_ACE_DB_DIR%" == "" (
        SET DEFAULT_DB_DIR=TRUE
        SET SW_ACE_DB_DIR=/../electric_office/example_db/ds/ds_admin
    )
)
FOR %%a in (eo_ssm) DO IF %input_alias%==%%a (
    SET RABBIT_CONFIG_MODULE_NAME=gss_basic_vertx_application
    SET RABBIT_CONFIG_FILE_NAME=empty_rabbit_config.xml
    SET alias_path=%PROJECTS_DIR%\eo_ssm\tests\config\gis_aliases
    SET alias=eo_nu_dev_no_db
    IF "%SW_ACE_DB_DIR%" == "" (
        SET DEFAULT_DB_DIR=TRUE
        SET SW_ACE_DB_DIR=/../electric_office/example_db/ds/ds_admin
    )
)
FOR %%a in (eo_plotting eo_plotting_open) DO IF %input_alias%==%%a (
    SET alias_dir=electric_office
    SET alias=eo_plotting_open
)
IF %input_alias%==eo_plotting_closed (
    SET alias_dir=electric_office
    SET alias=eo_plotting
)
IF %input_alias%==cbyd (
    SET alias_dir=electric_office
    SET alias=eo_cbyd
)
FOR %%a in (cymdist cymdist_open) DO IF %input_alias%==%%a (
    SET alias_dir=CYMDIST_Office
    SET alias=office_cymdist_open
)
IF %input_alias%==cymdist_closed (
    SET alias_dir=CYMDIST_Office
    SET alias=office_cymdist
)

FOR %%a in (eo_cim_poa_eg eo_cim_poa_eg_open eo_cim eo_cim_open) DO IF %input_alias%==%%a (
    SET alias_path=%PROJECTS_DIR%\gis_adapter\tests\config\gis_aliases
    SET alias=cimpoa_usr_eg_man_soapui
    IF "%SW_ACE_DB_DIR%" == "" (
        SET DEFAULT_DB_DIR=TRUE
        SET SW_ACE_DB_DIR=/../electric_office/example_db/ds/ds_admin
    )
)
FOR %%a in (eo_cim_poa_gisa eo_cim_poa_gisa_open) DO IF %input_alias%==%%a (
    SET alias_path=%PROJECTS_DIR%\gis_adapter\tests\config\gis_aliases
    SET alias=cimpoa_usr_gisa_man_soapui
    IF "%SW_ACE_DB_DIR%" == "" (
        IF NOT "%target%" == "S:" (
            SET DEFAULT_DB_DIR=TRUE
            SET SW_ACE_DB_DIR=/../gis_adapter/test_db/ds_admin
        )
    )
)
FOR %%a in (eo_cim_closed eo_cim_poa_eg_closed eo_cim_poa_gisa_closed) DO IF %input_alias%==%%a (
    SET alias_path=%PROJECTS_DIR%\gis_adapter\tests\config\gis_aliases
    SET alias=cimpoa_usr
)
FOR %%a in (eo_cim_std_eg eo_cim_std_eg_open) DO IF %input_alias%==%%a (
    SET alias_path=%PROJECTS_DIR%\gis_adapter\tests\config\gis_aliases
    SET alias=cimstd_usr_eg_man_soapui
    IF "%SW_ACE_DB_DIR%" == "" (
        SET DEFAULT_DB_DIR=TRUE
        SET SW_ACE_DB_DIR=/../electric_office/example_db/ds/ds_admin
    )
)
FOR %%a in (eo_cim_std_gisa eo_cim_std_gisa_open) DO IF %input_alias%==%%a (
    SET alias_path=%PROJECTS_DIR%\gis_adapter\tests\config\gis_aliases
    SET alias=cimstd_usr_gisa_man_soapui
    IF "%SW_ACE_DB_DIR%" == "" (
        IF NOT "%target%" == "S:" (
            SET DEFAULT_DB_DIR=TRUE
            SET SW_ACE_DB_DIR=/../gis_adapter/test_db/ds_admin
        )
    )
)
FOR %%a in (eo_cim_std_eg_closed eo_cim_std_gisa_closed) DO IF %input_alias%==%%a (
    SET alias_path=%PROJECTS_DIR%\gis_adapter\tests\config\gis_aliases
    SET alias=cimstd_usr
)
FOR %%a in (eo_dnom_eg eo_dnom_eg_open eo_dnom eo_dnom_open) DO IF %input_alias%==%%a (
    SET alias_path=%PROJECTS_DIR%\gis_adapter\tests\config\gis_aliases
    SET alias=dnom_usr_eg_man_soapui
    IF "%SW_ACE_DB_DIR%" == "" (
        SET DEFAULT_DB_DIR=TRUE
        SET SW_ACE_DB_DIR=/../electric_office/example_db/ds/ds_admin
    )
)
FOR %%a in (eo_dnom_gisa eo_dnom_gisa_open) DO IF %input_alias%==%%a (
    SET alias_path=%PROJECTS_DIR%\gis_adapter\tests\config\gis_aliases
    SET alias=dnom_usr_gisa_man_soapui
    IF "%SW_ACE_DB_DIR%" == "" (
        IF NOT "%target%" == "S:" (
            SET DEFAULT_DB_DIR=TRUE
            SET SW_ACE_DB_DIR=/../gis_adapter/test_db/ds_admin
        )
    )
)
FOR %%a in (eo_dnom_closed eo_dnom_eg_closed eo_dnom_gisa_closed) DO IF %input_alias%==%%a (
    SET alias_path=%PROJECTS_DIR%\gis_adapter\tests\config\gis_aliases
    SET alias=dnom_usr
)

FOR %%a in (gdo gdo_open) DO IF %input_alias%==%%a (
    SET alias_dir=gas_distribution_office
    SET alias=gdo_open
)
IF %input_alias%==gdo_closed (
    SET alias_dir=gas_distribution_office
    SET alias=gdo_closed
)
FOR %%a in (gdo_wm gdo_wm_open) DO IF %input_alias%==%%a (
    SET alias_dir=gas_distribution_office
    SET alias=dm_wm_gdo_open
)
IF %input_alias%==gdo_wm_closed (
    SET alias_dir=gas_distribution_office
    SET alias=dm_wm_gdo
)
FOR %%a in (gdo_ssm gdo_ssm_open) DO IF %input_alias%==%%a (
    SET RABBIT_CONFIG_MODULE_NAME=gdo_ssm_application
    SET RABBIT_CONFIG_FILE_NAME=ssm_extraction.xml
    SET alias_dir=gdo_ssm
    SET alias=gdo_ssm_open
)
FOR %%a in (gdo_nu gdo_nu_open) DO IF %input_alias%==%%a (
    SET RABBIT_CONFIG_MODULE_NAME=gdo_network_update_application
    SET RABBIT_CONFIG_FILE_NAME=ssm_extraction.xml
    SET alias_dir=gdo_ssm
    SET alias=gdo_ssm_open
)

FOR %%a in (gto gto_open) DO IF %input_alias%==%%a (
    SET alias_dir=global_transmission_office
    SET alias=gto_open
)
IF %input_alias%==gto_closed (
    SET alias_dir=global_transmission_office
    SET alias=gto_closed
)
FOR %%a in (gto_wm gto_wm_open) DO IF %input_alias%==%%a (
    SET alias_dir=global_transmission_office
    SET alias=dm_wm_gto_open
)
IF %input_alias%==gto_wm_closed (
    SET alias_dir=global_transmission_office
    SET alias=dm_wm_gto
)
FOR %%a in (gto_ssm gto_ssm_open) DO IF %input_alias%==%%a (
    SET RABBIT_CONFIG_MODULE_NAME=gto_ssm_application
    SET RABBIT_CONFIG_FILE_NAME=ssm_extraction.xml
    SET alias_dir=gto_ssm
    SET alias=gto_ssm_open
)
FOR %%a in (gto_nu gto_nu_open) DO IF %input_alias%==%%a (
    SET RABBIT_CONFIG_MODULE_NAME=gto_network_update_application
    SET RABBIT_CONFIG_FILE_NAME=ssm_extraction.xml
    SET alias_dir=gto_ssm
    SET alias=gto_ssm_open
)

FOR %%a in (go go_open) DO IF %input_alias%==%%a (
    SET alias_dir=gdo_gto_sync
    SET alias=go_open
)
IF %input_alias%==go_closed (
    SET alias_dir=gdo_gto_sync
    SET alias=go_cli
)

FOR %%a in (nrm nrm_open) DO IF %input_alias%==%%a (
    SET alias_dir=nrm
    SET alias=nrm_swaf_open_en
)
IF %input_alias%==nrm_closed (
    SET alias_dir=nrm
    SET alias=nrm_swaf
)
FOR %%a in (nrmb nrmb_open) DO IF %input_alias%==%%a (
    SET alias_dir=nrmb
    SET alias=nrmb_swaf_open
)

FOR %%a in (nv network_viewer camdb_nv nv_open) DO IF %input_alias%==%%a (
    @REM SET alias_path=C:\projects\hg\network_viewer\CamDB_NetworkViewer\tests\config\gis_aliases
    SET RABBIT_CONFIG_MODULE_NAME=gss_basic_vertx_application
    SET RABBIT_CONFIG_FILE_NAME=empty_rabbit_config.xml
    set BIFROST_URL=http://localhost:3001
    set EIS_RESOURCES_PATH=%TEMP%\gss.vertx
    set RABBITMQ_PATH=localhost
    set GSS_LOGGING_LEVEL=info
    set GSS_HOME=%SMALLWORLD_GIS%\..\gss\geospatial_server
    rem set SW_MESSAGE_DB_DIR=%SMALLWORLD_GIS%\..\smallworld_registry
    SET alias_dir=network_viewer\CamDB_NetworkViewer
    SET alias=nvp_camdb_vertx_open
    SET alias_path=C:\projects\hg\network_viewer\CamDB_NetworkViewer\config\gis_aliases
    IF "%SW_ACE_DB_DIR%" == "" (
        SET DEFAULT_DB_DIR=TRUE
        SET SW_ACE_DB_DIR=\..\cambridge_db\ds\ds_admin
    )
)

REM Common env variables for SSM sessions
SET RABBITMQ_PATH=localhost
SET EIS_RESOURCES_PATH=C:\Temp
SET SOLR_HOST_NAME=develop
SET SW_SOLR_USER=fakesolrset
SET SW_SOLR_PASSWORD=fakesolr
SET K8SHOST=develop
SET BIFROST_URL=http://develop:3001
SET USERNAME_AND_PASSWORDS={}
SET login=-login root

REM End Session Aliases

:date
IF %version:~-2%==PB (
    SET build_date=
    SET runalias_path=%target%\SW%version%\core\bin\x86\runalias
    GOTO session
)
SET /A count=0

:dateloop
ECHO >"%temp%\%~n0.vbs" s=DateAdd("d",%day%,now) : d=weekday(s)
ECHO >>"%temp%\%~n0.vbs" WScript.Echo year(s)^& right(100+month(s),2)^& right(100+day(s),2)
FOR /f %%a IN ('cscript /nologo "%temp%\%~n0.vbs"') DO SET result=%%a
DEL "%temp%\%~n0.vbs"
SET yyyy=%result:~0,4%
SET mm=%result:~4,2%
SET dd=%result:~6,2%
SET build_date=%yyyy%-%mm%-%dd%\

IF %alias_path%==null (
    IF EXIST %target%\SW%version%\%build_date%%alias_dir%\config\gis_aliases (
        SET runalias_path=%target%\SW%version%\%build_date%core\bin\x86\runalias
        SET alias_path=%target%\SW%version%\%build_date%%alias_dir%\config\gis_aliases
        GOTO session
    )
) ELSE (
    IF EXIST %alias_path% (
        IF EXIST %target%\SW%version%\%build_date%core\bin\x86\ (
            SET runalias_path=%target%\SW%version%\%build_date%core\bin\x86\runalias
            GOTO session
        )
    )
)

IF %count%==14 (
    ECHO Cannot find a local installation for %alias% from the last 14 days!
    GOTO end
)

IF %alias%==unset (
    ECHO Alias is unset!!!!
    %PROJECTS_DIR%/magik-dev/local_magik -help
    GOTO end
)

SET /A count+=1
SET /A day-=1
ECHO Cannot find a local installation for %alias% for %target%\SW%version%/%build_date% going back one day
GOTO dateloop


:session
SET command=%runalias_path%%debug_path%%java_debugger% -a %alias_path% %alias% -cli %login% %vvmds% %noinit%

if %print%==1 (
    ECHO %command%
    GOTO end
)

SET SMALLWORLD_GIS=%target%\SW%version%\%build_date%core

IF "%DEFAULT_DB_DIR%" == "TRUE" (
        SET SW_MODELIT_DB_DIR=%SMALLWORLD_GIS%%SW_MODELIT_DB_DIR%
        SET SW_ACE_DB_DIR=%SMALLWORLD_GIS%%SW_ACE_DB_DIR%
    )

CALL %PROJECTS_DIR%\magik-dev\local_product -print
ECHO Starting %alias%...
ECHO %command%
CMD /C %command%
EXIT /B 0

:end