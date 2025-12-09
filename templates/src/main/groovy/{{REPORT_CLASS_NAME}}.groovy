package {{NAMESPACE}}

import com.morpheusdata.core.AbstractReportProvider
import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.core.Plugin
import com.morpheusdata.model.OptionType
import com.morpheusdata.model.ReportResult
import com.morpheusdata.model.ReportResultRow
import com.morpheusdata.response.ServiceResponse
import com.morpheusdata.views.HTMLResponse
import com.morpheusdata.views.ViewModel

import groovy.sql.GroovyRowResult
import groovy.sql.Sql
import java.sql.Connection
import io.reactivex.rxjava3.core.Observable
import groovy.util.logging.Slf4j

@Slf4j
class {{REPORT_CLASS_NAME}} extends AbstractReportProvider {
	protected MorpheusContext morpheusContext
	protected Plugin plugin

	{{REPORT_CLASS_NAME}}(Plugin plugin, MorpheusContext morpheusContext) {
		this.morpheusContext = morpheusContext
		this.plugin = plugin
	}

	/**
	 * Returns the Morpheus Context for interacting with data stored in the Main Morpheus Application
	 *
	 * @return an implementation of the MorpheusContext for running Future based rxJava queries
	 */
	@Override
	MorpheusContext getMorpheus() {
		return this.morpheusContext
	}

	/**
	 * Returns the instance of the Plugin class that this provider is loaded from
	 * @return Plugin class contains references to other providers
	 */
	@Override
	Plugin getPlugin() {
		return this.plugin
	}

	/**
	 * A unique shortcode used for referencing the provided provider. Make sure this is going to be unique as any data
	 * that is seeded or generated related to this provider will reference it by this code.
	 * @return short code string that should be unique across all other plugin implementations.
	 */
	@Override
	String getCode() {
		return '{{REPORT_CODE}}'
	}

	/**
	 * Provides the provider name for reference when adding to the Morpheus Orchestrator
	 * NOTE: This may be useful to set as an i18n key for UI reference and localization support.
	 *
	 * @return either an English name of a Provider or an i18n based key that can be scanned for in a properties file.
	 */
	@Override
	String getName() {
		return '{{REPORT_NAME}}'
	}

	/**
	 * Returns the description of this report provider
	 * @return String
	 */
	@Override
	String getDescription() {
		return '{{REPORT_DESCRIPTION}}'
	}

	/**
	 * Returns the category of the report this report provider provides
	 * @return String
	 */
	@Override
	String getCategory() {
		return '{{REPORT_CATEGORY}}'
	}

	/**
	 * Returns if this report can only be viewed by the account that owns it
	 * @return Boolean
	 */
	@Override
	Boolean getOwnerOnly() {
		return {{OWNER_ONLY}}
	}

	/**
	 * Returns if this report can only be run on the master account
	 * @return Boolean
	 */
	@Override
	Boolean getMasterOnly() {
		return {{MASTER_ONLY}}
	}

	/**
	 * Returns if this report supports all zone types
	 * @return Boolean
	 */
	@Override
	Boolean getSupportsAllZoneTypes() {
		return true
	}

	/**
	 * Returns an array of option types to configure the report
	 * @return List<OptionType>
	 */
	@Override
	List<OptionType> getOptionTypes() {
		return []
	}

	/**
	 * Validates any provided options that are being passed to the report provider
	 * @param opts option map to validate
	 * @return ServiceResponse
	 */
	@Override
	ServiceResponse validateOptions(Map opts) {
		return ServiceResponse.success()
	}

	/**
	 * Processes the report data and saves the result
	 * @param reportResult the report result object to process
	 */
	@Override
	void process(ReportResult reportResult) {
		log.debug("Processing {{REPORT_NAME}} report...")
		
		// Update report status to generating
		morpheus.report.updateReportResultStatus(reportResult, ReportResult.Status.generating).blockingAwait()
		
		Long displayOrder = 0
		List<GroovyRowResult> repResults = []
		
		Connection dbConnection
		try {
			// Get database connection
			dbConnection = morpheus.report.getReadOnlyDatabaseConnection().blockingGet()
			
			if (dbConnection == null) {
				log.error("Failed to obtain database connection")
				morpheus.report.updateReportResultStatus(reportResult, ReportResult.Status.failed).blockingAwait()
				return
			}

			// Execute the SQL query
			String sql = """{{SQL_QUERY}}"""
			log.debug("Executing SQL: ${sql}")
			
			Sql sqlInstance = new Sql(dbConnection)
			repResults = sqlInstance.rows(sql)
			
			log.debug("Query returned ${repResults.size()} rows")
			
		} catch (Exception e) {
			log.error("Error executing SQL query: ${e.message}", e)
			morpheus.report.updateReportResultStatus(reportResult, ReportResult.Status.failed).blockingAwait()
			return
		} finally {
			// Always release the database connection
			if (dbConnection) {
				morpheus.report.releaseDatabaseConnection(dbConnection)
			}
		}

		try {
			// Process results using Observable pattern
			Observable<GroovyRowResult> observable = Observable.fromIterable(repResults)
			observable.map { resultRow ->
				log.debug("Processing row: ${resultRow}")
				
				def Map<String, Object> data = [:]
				resultRow.each { key, value ->
					data[key.toString()] = value
				}
				
				ReportResultRow resultRowRecord = new ReportResultRow(
					section: ReportResultRow.SECTION_MAIN,
					displayOrder: displayOrder++,
					dataMap: data
				)
				return resultRowRecord
			}.buffer(50).doOnComplete {
				// Mark report as ready when complete
				log.debug("Report processing completed successfully")
				morpheus.report.updateReportResultStatus(reportResult, ReportResult.Status.ready).blockingAwait()
			}.doOnError { Throwable t ->
				// Mark report as failed on error
				log.error("Error processing report data: ${t.message}", t)
				morpheus.report.updateReportResultStatus(reportResult, ReportResult.Status.failed).blockingAwait()
			}.subscribe { resultRows ->
				// Append results to the report
				morpheus.report.appendResultRows(reportResult, resultRows).blockingGet()
			}
			
		} catch (Exception e) {
			log.error("Error processing {{REPORT_NAME}} report: ${e.message}", e)
			morpheus.report.updateReportResultStatus(reportResult, ReportResult.Status.failed).blockingAwait()
		}
	}

	/**
	 * Generates HTML content for the report using Handlebars template
	 * @param reportResult the report data
	 * @param reportRowsBySection the data organized by section
	 * @return HTMLResponse with rendered content
	 */
	@Override
	HTMLResponse renderTemplate(ReportResult reportResult, Map<String, List<ReportResultRow>> reportRowsBySection) {
		ViewModel<String> model = new ViewModel<String>()
		model.object = reportRowsBySection
		getRenderer().renderTemplate("hbs/{{REPORT_TEMPLATE}}", model)
	}
}